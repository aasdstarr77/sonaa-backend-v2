'use strict';

const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../models/Order');
const Client = require('../models/Client');
const { createNotification, notifyAdmins } = require('../utils/notifications');
const Fanni = require('../models/Fanni');
const Rating = require('../models/Rating');
const WalletTransaction = require('../models/WalletTransaction');
const AdminConfig = require('../models/AdminConfig');
const AdminAuditLog = require('../models/AdminAuditLog');
const { auth, canAccessAdmin, isRootAdmin } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');
const { generateSN } = require('../utils/generateSN');
const { normalizePhone } = require('../utils/phone');
const {
  ALL_SERVICES,
  CATEGORIES,
  normalizeServiceName
} = require('../config/professions');

const router = express.Router();

const {
  toWesternDigits,
  containsEgyptianMobile,
  sanitizeText,
  findPhoneContainingField,
  sanitizeOffer,
  publicOrder,
  createFanniCanHandleService
} = require('../utils/orderPresentation');
const fanniCanHandleService = createFanniCanHandleService({ CATEGORIES, normalizeServiceName });
const createOrderChatRouter = require('./order/chat');
const createOrderTrackingRouter = require('./order/tracking');
const createOrderCreationRouter = require('./order/create');
const createOrderAdminPublicationRouter = require('./order/adminPublication');
const createOrderOfferRouter = require('./order/offers');
const createOrderLifecycleRouter = require('./order/lifecycle');
const createOrderRatingRouter = require('./order/ratings');
const createOrderAvailableRouter = require('./order/available');


async function writeOrderAdminAudit(req, action, target, details) {
  try {
    await AdminAuditLog.create({
      action: String(action || '').slice(0, 100),
      category: 'orders',
      target: String(target || '').slice(0, 200),
      details: String(details || '').slice(0, 1000),
      adminName: String(req.user?.name || req.user?.phone || req.user?.email || 'admin').slice(0, 120),
      adminId: String(req.user?._id || req.userId || ''),
      ip: String(req.ip || '').slice(0, 80)
    });
  } catch (err) {
    console.error('Could not write order admin audit log:', err.message);
  }
}

const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;
const DEFAULT_COMMISSION_RATE = 10;

/*
 * أسماء المناطق التي تستخدمها واجهة العميل،
 * مع الاحتفاظ بالأسماء القديمة المقبولة سابقًا.
 */


const createSchema = Joi.object({
  service: Joi.string()
    .trim()
    .valid(...ALL_SERVICES)
    .required()
    .messages({
      'any.only': 'الخدمة المطلوبة غير موجودة في قائمة الخدمات المتاحة',
      'any.required': 'الخدمة مطلوبة'
    }),
  area: Joi.string().trim().min(2).max(100).required().messages({ 'any.required': 'اكتب المنطقة أو الحي' }),
  address: Joi.string().trim().min(2).max(250).allow('').optional(),
  phone: Joi.string().trim().required(),
  clientPhone: Joi.string().trim(),
  clientName: Joi.string().trim().max(50).allow(''),
  budget: Joi.string().trim().max(50).allow('').optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  desc: Joi.string().trim().max(1000).allow('').optional(),
  voiceRecordingData: Joi.string().max(520000).pattern(/^data:audio\/(?:webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-zA-Z0-9.-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/).allow('').optional()
}).unknown(false);

function validSN(sn) {
  return /^SN\d{6}$/i.test(String(sn || ''));
}

function clientTokenFrom(req) {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return String(req.body?.clientToken || req.query?.clientToken || '');
}

async function verifyClientToken(req, order) {
  const token = clientTokenFrom(req);

  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (order.clientAccount) {
      const activeClient = await Client.findOne({ _id: order.clientAccount, status: 'نشط' }).select('_id tokenVersion').lean();
      if (!activeClient) return false;
      if (payload.role === 'client') return String(payload.id) === String(order.clientAccount) && Number(payload.tokenVersion || 0) === Number(activeClient.tokenVersion || 0);

      const tokenMatchesOrder = payload.purpose === 'client-order' &&
        String(payload.orderId) === String(order._id) &&
        String(payload.sn).toUpperCase() === String(order.sn).toUpperCase();
      if (!tokenMatchesOrder) return false;

      // New account-bound tokens carry the account id. Old tokens are accepted only
      // for orders linked before this migration; a legacy claim stamps clientAccountLinkedAt.
      if (payload.accountId) return String(payload.accountId) === String(order.clientAccount);
      return !order.clientAccountLinkedAt;
    }

    return (
      payload.purpose === 'client-order' &&
      String(payload.orderId) === String(order._id) &&
      String(payload.sn).toUpperCase() === String(order.sn).toUpperCase()
    );
  } catch {
    return false;
  }
}


function publicRatings(ratings) {
  return (ratings || []).map(rating => ({
    reviewerRole: rating.reviewerRole,
    stars: rating.stars,
    comment: rating.comment || '',
    createdAt: rating.createdAt
  }));
}

async function hasRatingBlock({ clientPhone, fanniId }) {
  const phone = normalizePhone(clientPhone);
  if (!phone || !fanniId) return false;
  return Rating.exists({
    clientPhone: phone,
    fanniId,
    blockFuture: true
  });
}

async function currentPricing() {
  const config = await AdminConfig.findOne({ key: 'main' }).select('pricing').lean();
  return config?.pricing || { check: 0, commission: DEFAULT_COMMISSION_RATE, minOffer: 1, maxOffer: 1000000 };
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// ترقية آلية عند اكتمال المهام أو تحديث تقييم العميل.
// لا تخفّض المستوى الحالي تلقائيًا إذا انخفض التقييم لاحقًا.
const PROFESSIONAL_LEVEL_RANK = {
  'مبتدئ': 0, 'ممارس': 1, 'محترف': 2, 'خبير مبتدئ': 3,
  'خبير': 4, 'خبير أول': 5, 'استشاري فني': 6, 'نخبة': 7, 'أسطوري': 8
};

async function autoPromoteFanni(fanniId, reason) {
  if (!fanniId) return null;
  const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni' });
  if (!fanni || typeof fanni.calculateLevel !== 'function') return null;
  const currentLevel = fanni.level || 'مبتدئ';
  const calculatedLevel = fanni.calculateLevel();
  const currentRank = PROFESSIONAL_LEVEL_RANK[currentLevel] ?? 0;
  const calculatedRank = PROFESSIONAL_LEVEL_RANK[calculatedLevel] ?? 0;
  if (calculatedRank <= currentRank) return fanni;
  fanni.level = calculatedLevel;
  fanni.levelHistory.push({
    from: currentLevel, to: calculatedLevel, date: new Date(), by: 'النظام',
    reason: String(reason || 'ترقية آلية حسب الإنجاز').slice(0, 500)
  });
  fanni.decisions.push({
    action: 'ترقية مستوى',
    reason: 'ترقية آلية من ' + currentLevel + ' إلى ' + calculatedLevel + '. ' + String(reason || '').slice(0, 350),
    date: new Date(), by: 'النظام',
    meta: { from: currentLevel, to: calculatedLevel, automatic: true }
  });
  await fanni.save();
  return fanni;
}

function getAcceptedOffer(order, offerId) {
  return order.offers.id(offerId);
}

router.use(createOrderLifecycleRouter({
  mongoose, Order, WalletTransaction, Fanni, auth, validSN, verifyClientToken,
  ACTIVE_STATUSES, currentPricing, DEFAULT_COMMISSION_RATE, money, getAcceptedOffer,
  publicOrder, createNotification, hasAcceptedGuidelines, autoPromoteFanni, sanitizeText
}));
router.use(createOrderRatingRouter({
  Joi, Order, validSN, verifyClientToken, jwt, Fanni, Rating, normalizePhone,
  sanitizeText, autoPromoteFanni, createNotification
}));
router.use(createOrderAvailableRouter({
  auth, Order, ACTIVE_STATUSES, Fanni, Rating, normalizePhone,
  fanniCanHandleService, publicOrder
}));

router.use(createOrderCreationRouter({
  clientAuth,
  createSchema,
  findPhoneContainingField,
  normalizePhone,
  Order,
  generateSN,
  sanitizeText,
  notifyAdmins,
  createNotification,
  jwt,
  publicOrder
}));
router.use(createOrderAdminPublicationRouter({
  auth,
  validSN,
  Order,
  writeOrderAdminAudit,
  ORDER_EXPIRY_HOURS,
  Fanni,
  fanniCanHandleService,
  createNotification,
  publicOrder
}));

/*
 * الطلبات المتاحة:
 * - الإدارة يمكنها الاطلاع على كل الطلبات النشطة.
 * - الفني المعتمد يرى الطلبات التي تطابق تخصصاته فقط.
 * - بيانات العميل الشخصية لا تُرسل في هذه المرحلة.
 */
async function hasAcceptedGuidelines(fanniId) {
  const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni', status: 'معتمد' }).select('technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();
  return Boolean(fanni?.technicianGuidelinesAcceptedAt && fanni?.technicianGuidelinesVersion);
}
function hasContactDetails(text) { return containsEgyptianMobile(String(text || '')) || /(?:https?:\/\/|www\.|t\.me\/|wa\.me\/|bit\.ly\/)/i.test(String(text || '')); }



router.use(createOrderOfferRouter({
  Order,
  Rating,
  Fanni,
  auth,
  hasAcceptedGuidelines,
  sanitizeOffer,
  publicRatings,
  normalizePhone,
  sanitizeText,
  hasRatingBlock,
  validSN,
  ACTIVE_STATUSES,
  currentPricing,
  DEFAULT_COMMISSION_RATE,
  money,
  findPhoneContainingField,
  fanniCanHandleService,
  createNotification,
  Joi
}));

router.use(createOrderChatRouter({
  jwt,
  hasContactDetails,
  Order,
  Fanni,
  WalletTransaction,
  mongoose,
  createNotification,
  auth,
  ACTIVE_STATUSES,
  validSN,
  verifyClientToken,
  fanniCanHandleService,
  hasAcceptedGuidelines,
  money,
  DEFAULT_COMMISSION_RATE
}));
router.use(createOrderTrackingRouter({
  Order,
  Rating,
  Fanni,
  mongoose,
  ACTIVE_STATUSES,
  validSN,
  verifyClientToken,
  publicOrder,
  publicRatings,
  auth,
  isRootAdmin,
  canAccessAdmin,
  fanniCanHandleService
}));

module.exports = router;