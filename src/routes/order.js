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
const { writeOrderAdminAudit } = require('../services/auditLogService');
const createOrderTrackingController = require('../controllers/orderTrackingController');
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



const ACTIVE_STATUSES = ['تم النشر', 'وصلتك عروض'];
const ORDER_EXPIRY_HOURS = 48;
const DEFAULT_COMMISSION_RATE = 10;

/*
 * أسماء المناطق التي تستخدمها واجهة العميل،
 * مع الاحتفاظ بالأسماء القديمة المقبولة سابقًا.
 */


const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, digit => {
    const arabicIndex = ARABIC_DIGITS.indexOf(digit);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(PERSIAN_DIGITS.indexOf(digit));
  });
}

function containsEgyptianMobile(value) {
  if (typeof value !== 'string' || !value.trim()) return false;

  const normalized = toWesternDigits(value);
  const chunks =
    normalized.match(/\d(?:[\s().+-_/\،,؛:]*\d){9,15}/g) || [];

  return chunks.some(chunk => {
    const digits = chunk.replace(/\D/g, '');
    return (
      /01[0125]\d{8}/.test(digits) ||
      /201[0125]\d{8}/.test(digits) ||
      /00201[0125]\d{8}/.test(digits)
    );
  });
}

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  if (containsEgyptianMobile(value)) {
    return '[تم إخفاء التفاصيل لاحتوائها على رقم تواصل]';
  }
  return value;
}

function findPhoneContainingField(fields) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (
      typeof value === 'string' &&
      containsEgyptianMobile(value)
    ) {
      return fieldName;
    }
  }
  return null;
}

function sanitizeOffer(offer) {
  const safeOffer =
    typeof offer.toObject === 'function'
      ? offer.toObject()
      : { ...offer };

  delete safeOffer.fanniPhone;
  delete safeOffer.phone;
  delete safeOffer.fanniId;
  delete safeOffer.fanni;

  if (typeof safeOffer.message === 'string') {
    safeOffer.message = sanitizeText(safeOffer.message);
  }

  return safeOffer;
}

function publicOrder(order, options = {}) {
  const {
    includeAddress = true,
    includeAssignedFanniPhone = false,
    includeClientName = true
  } = options;

  if (!order) return null;

  const data =
    typeof order.toObject === 'function'
      ? order.toObject()
      : { ...order };

  const assignedFanniId = data.assignedFanni;
  data.hasVoiceRecording = Boolean(data.voiceRecordingData);
  delete data.voiceRecordingData;

  if (!includeAddress) delete data.address;
  if (!includeClientName) delete data.clientName;

  delete data.clientPhone;
  delete data.phone;
  delete data.clientAccount;
  delete data.assignedFanni;
  delete data.assignedFanniPhone;
  // Platform commission is internal financial data and must never be exposed in client-facing order payloads.
  delete data.commissionRate;
  delete data.commissionAmount;
  delete data.commissionCharged;
  delete data.commissionChargedAt;

  if (
    includeAssignedFanniPhone &&
    data.status === 'تم اختيار فني' &&
    assignedFanniId
  ) {
    const acceptedOffer = Array.isArray(data.offers)
      ? data.offers.find(
          offer =>
            (data.acceptedOfferId &&
              String(offer._id) === String(data.acceptedOfferId)) ||
            (!data.acceptedOfferId &&
              String(offer.fanni) === String(assignedFanniId))
        )
      : null;

    if (
      acceptedOffer &&
      typeof acceptedOffer.fanniPhone === 'string' &&
      acceptedOffer.fanniPhone.trim()
    ) {
      data.assignedFanniPhone = acceptedOffer.fanniPhone;
    }
  }

  if (typeof data.description === 'string') {
    data.description = sanitizeText(data.description);
  }

  if (typeof data.desc === 'string') {
    data.desc = sanitizeText(data.desc);
  }

  if (Array.isArray(data.offers)) {
    // A technician is allowed one offer per order. Hide historical duplicates
    // at the API boundary as well as preventing new concurrent duplicates.
    const seenTechnicians = new Set();
    const uniqueOffers = [];
    for (const offer of data.offers) {
      const technicianId = String(offer?.fanni?._id || offer?.fanni || offer?.fanniId || '').trim();
      const offerId = String(offer?._id || offer?.id || '').trim();
      const key = technicianId ? `fanni:${technicianId}` : offerId ? `offer:${offerId}` : '';
      if (key && seenTechnicians.has(key)) continue;
      if (key) seenTechnicians.add(key);
      uniqueOffers.push(offer);
    }
    data.offers = uniqueOffers.map(sanitizeOffer);
  }

  return data;
}

/*
 * التحقق من تخصص الفني في الباك إند.
 *
 * لو تخصص الفني اسم قسم كامل، مثل "دش وكاميرات وشاشات"،
 * يُسمح له بخدمات القسم.
 *
 * ولو تخصصه اسم خدمة محددة، مثل "تركيب دش"،
 * يُسمح له بالخدمة المحددة فقط.
 */
function fanniCanHandleService(specialties, serviceName) {
  if (!Array.isArray(specialties) || !serviceName) return false;

  const normalizedService = normalizeServiceName(serviceName);
  if (!normalizedService) return false;

  const normalizedSpecialties = specialties
    .filter(value => typeof value === 'string')
    .map(normalizeServiceName)
    .filter(Boolean);

  if (normalizedSpecialties.includes(normalizedService)) {
    return true;
  }

  const category = CATEGORIES.find(item =>
    item.services.some(
      service => normalizeServiceName(service) === normalizedService
    )
  );

  if (!category) return false;

  return normalizedSpecialties.includes(
    normalizeServiceName(category.label)
  );
}

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
    const tokenMatchesOrder = payload.purpose === 'client-order'
      && String(payload.orderId) === String(order._id)
      && String(payload.sn).toUpperCase() === String(order.sn).toUpperCase();
    if (order.clientAccount) {
      const activeClient = await Client.findOne({ _id: order.clientAccount, status: 'نشط' }).select('_id tokenVersion').lean();
      if (!activeClient) return false;
      if (payload.role === 'client') {
        return String(payload.id) === String(order.clientAccount)
          && Number(payload.tokenVersion || 0) === Number(activeClient.tokenVersion || 0);
      }
      if (!tokenMatchesOrder) return false;
      if (payload.accountId) {
        return String(payload.accountId) === String(order.clientAccount)
          && Number(payload.tokenVersion || 0) === Number(activeClient.tokenVersion || 0);
      }
      // Old order tokens are valid only until this order is linked to an account.
      return !order.clientAccountLinkedAt;
    }
    return tokenMatchesOrder;
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



































const trackOrder = createOrderTrackingController({ Order, Fanni, Rating, mongoose, validSN, verifyClientToken, publicOrder, publicRatings });









const routeContext = { express, Joi, mongoose, jwt, Order, createNotification, notifyAdmins, Fanni, Rating, WalletTransaction, AdminConfig, AdminAuditLog, writeOrderAdminAudit, createOrderTrackingController, auth, canAccessAdmin, isRootAdmin, clientAuth, generateSN, normalizePhone, ALL_SERVICES, CATEGORIES, normalizeServiceName, ACTIVE_STATUSES, ORDER_EXPIRY_HOURS, DEFAULT_COMMISSION_RATE, ARABIC_DIGITS, PERSIAN_DIGITS, createSchema, PROFESSIONAL_LEVEL_RANK, trackOrder, toWesternDigits, containsEgyptianMobile, sanitizeText, findPhoneContainingField, sanitizeOffer, publicOrder, fanniCanHandleService, validSN, clientTokenFrom, verifyClientToken, publicRatings, hasRatingBlock, currentPricing, money, autoPromoteFanni, getAcceptedOffer, hasAcceptedGuidelines, hasContactDetails };

require('./order/creation-and-review')(router, routeContext);
require('./order/technician-discovery')(router, routeContext);
require('./order/lifecycle')(router, routeContext);
require('./order/chat-and-price')(router, routeContext);
require('./order/tracking')(router, routeContext);

module.exports = router;
