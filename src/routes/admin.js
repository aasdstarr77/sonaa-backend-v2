'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Fanni = require('../models/Fanni');
const Client = require('../models/Client');
const Notification = require('../models/Notification');
const TopupRequest = require('../models/TopupRequest');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
const Complaint = require('../models/Complaint');
const WalletTransaction = require('../models/WalletTransaction');
const { createNotification } = require('../utils/notifications');
const Service = require('../models/Service');
const Region = require('../models/Region');
const AdminConfig = require('../models/AdminConfig');
const AdminAuditLog = require('../models/AdminAuditLog');
const PageVisit = require('../models/PageVisit');

const {
  CATEGORIES,
  ALL_SERVICES,
  normalizeServiceName,
  findCategoryByService,
  findCategoryByLabel
} = require('../config/professions');

const { auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');
const router = express.Router();

const createAdminServicesRouter = require('./admin/services');
const createAdminPlatformRouter = require('./admin/platform');
const createAdminOperationsRouter = require('./admin/operations');
const createAdminUiLayoutRouter = require('./admin/uiLayout');
const createAdminFanniProfilesRouter = require('./admin/fanniProfiles');

const ADMIN_TOKEN_EXPIRY = '1d';
const MAX_LIST_LIMIT = 500;

const loginSchema = Joi.object({
  phone: Joi.string().trim().optional(),
  email: Joi.string().trim().email().optional(),
  password: Joi.string().min(1).required()
}).or('phone', 'email');

const amountSchema = Joi.number()
  .strict()
  .min(0)
  .max(100000000)
  .required();

const reasonSchema = Joi.string().trim().max(500).allow('');

const complaintStatusSchema = Joi.string().valid(
  'جديدة',
  'قيد المراجعة',
  'تم الحل',
  'مرفوضة'
);

function publicFanni(fanni) {
  const item = typeof fanni.toObject === 'function'
    ? fanni.toObject()
    : { ...fanni };
  delete item.passwordHash;
  delete item.__v;
  const statusMap = {
    'معتمد': 'approved',
    'قيد المراجعة': 'pending',
    'مرفوض': 'rejected',
    'معلق': 'disabled'
  };
  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    isApproved: item.status === 'معتمد',
    isDisabled: item.status === 'معلق',
    balance: Number(item.walletBalance || 0),
    skill: Array.isArray(item.specialties) ? item.specialties.join('، ') : '',
    service: Array.isArray(item.specialties) ? item.specialties.join('، ') : ''
  };
}

function publicTopup(request) {
  const item = typeof request.toObject === 'function' ? request.toObject() : { ...request };
  const statusMap = { 'قيد المراجعة': 'pending', 'مقبول': 'approved', 'مرفوض': 'rejected' };
  return {
    ...item,
    status: statusMap[item.status] || 'pending',
    actualStatus: item.status,
    fromPhone: item.senderNumber || '',
    phone: item.fanniPhone || ''
  };
}

function adminName(req) { return String(req.user?.name || 'الإدارة').slice(0, 50); }
function decision(req, action, reason = '') {
  return { action, reason: String(reason || '').trim().slice(0, 500), date: new Date(), by: adminName(req), byId: req.user?._id };
}
function validId(value) { return mongoose.isValidObjectId(value); }
function sendBadId(res) { return res.status(400).json({ message: 'معرّف غير صالح' }); }
function getLoginPhone(body) {
  const raw = String(body.phone || body.email || '').trim();
  if (raw.includes('@')) {
    const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();
    if (!configuredEmail || !configuredPhone || raw.toLowerCase() !== configuredEmail) { return null; }
    return normalizePhone(configuredPhone);
  }
  return normalizePhone(raw);
}

router.post('/bootstrap', async (req, res, next) => {
  try {
    const configuredSecret = String(process.env.ADMIN_SETUP_SECRET || '');
    const suppliedSecret = typeof req.body?.secret === 'string' ? req.body.secret : '';
    if (configuredSecret.length < 32 || suppliedSecret.length < 32) {
      return res.status(503).json({ message: 'إعداد إنشاء حساب الإدارة غير مكتمل' });
    }
    const expected = Buffer.from(configuredSecret, 'utf8');
    const supplied = Buffer.from(suppliedSecret, 'utf8');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ message: 'المفتاح السري غير صحيح' });
    }
    const adminCount = await Fanni.countDocuments({ role: 'admin' });
    if (adminCount > 0) {
      return res.status(409).json({ message: 'يوجد حساب إدارة بالفعل. تم إيقاف إنشاء الحساب الأول.' });
    }
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();
    const password = String(process.env.ADMIN_PASSWORD || '');
    const name = String(process.env.ADMIN_NAME || 'إدارة صناع').trim();
    if (!email || !Joi.string().email().validate(email).value || !configuredPhone || password.length < 12 || name.length < 2 || name.length > 50) {
      return res.status(503).json({ message: 'راجع إعدادات ADMIN_EMAIL وADMIN_PHONE وADMIN_PASSWORD وADMIN_NAME على الخادم' });
    }
    const phone = normalizePhone(configuredPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(503).json({ message: 'رقم الإدارة الموجود في إعدادات الخادم غير صالح' });
    }
    const existingPhone = await Fanni.findOne({ phone }).select('_id');
    if (existingPhone) {
      return res.status(409).json({ message: 'رقم الإدارة مستخدم بالفعل في حساب موجود. لم يتم تغيير أي حساب.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'إعداد JWT_SECRET غير موجود على الخادم' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Fanni.create({
      name, phone, passwordHash, specialties: ['إدارة'], areas: ['الإدارة'], status: 'معتمد', role: 'admin',
      decisions: [{ action: 'تسجيل', reason: 'إنشاء أول حساب إدارة', date: new Date(), by: 'النظام' }]
    });
    return res.status(201).json({
      message: 'تم إنشاء أول حساب إدارة بنجاح. احتفظ ببيانات الدخول في مكان آمن.',
      user: { id: String(admin._id), name: admin.name, phone: admin.phone, role: admin.role }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'الحساب أو رقم الهاتف موجود بالفعل. لم يتم إنشاء حساب مكرر.' });
    }
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'تسجيل الدخول غير متاح بسبب إعدادات الخادم' });
    }
    const phone = getLoginPhone(req.body);
    if (!phone) { return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' }); }
    const admin = await Fanni.findOne({ phone, $or: [{ role: 'admin' }, { adminRole: { $in: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'] } }] }).select('+passwordHash');
    if (!admin || !admin.passwordHash || !(await bcrypt.compare(req.body.password, admin.passwordHash))) {
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }
    if (admin.status === 'معلق' || admin.status === 'مرفوض') {
      return res.status(403).json({ message: 'حساب الإدارة غير مسموح له بالدخول' });
    }
    const token = jwt.sign({ id: admin._id, role: admin.role, adminRole: admin.adminRole || null, tokenVersion: Number(admin.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: ADMIN_TOKEN_EXPIRY });
    return res.json({ token, user: { id: String(admin._id), name: admin.name, phone: admin.phone, role: admin.role, adminRole: admin.adminRole || null } });
  } catch (err) { next(err); }
});

router.get('/complaints', auth('admin'), async (req, res, next) => {
  try {
    const filter = {};
    const status = String(req.query.status || '').trim();
    if (status) {
      const { error } = complaintStatusSchema.validate(status);
      if (error) { return res.status(400).json({ message: 'حالة الشكوى المطلوبة غير صحيحة' }); }
      filter.status = status;
    }
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIST_LIMIT) : MAX_LIST_LIMIT;
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ complaints, data: complaints, total: complaints.length });
  } catch (err) { next(err); }
});

router.get('/complaints/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const complaint = await Complaint.findById(req.params.id).lean();
    if (!complaint) { return res.status(404).json({ message: 'الشكوى غير موجودة' }); }
    return res.json({ complaint, data: complaint });
  } catch (err) { next(err); }
});

router.patch('/complaints/:id', auth('admin'), validate(Joi.object({
  status: complaintStatusSchema.optional(),
  adminNote: Joi.string().trim().max(1000).allow('').optional(),
  adminResponse: Joi.string().trim().max(1000).allow('').optional()
}).min(1)), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const updates = {};
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
    if (hasStatus) { updates.status = req.body.status; }
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminNote')) { updates.adminNote = req.body.adminNote; }
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminResponse')) { updates.adminResponse = req.body.adminResponse; }
    if (hasStatus) { updates.reviewedAt = new Date(); updates.reviewedBy = adminName(req); }
    updates.updatedAt = new Date();
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!complaint) { return res.status(404).json({ message: 'الشكوى غير موجودة' }); }
    await writeAdminAudit(req, 'تحديث شكوى', 'complaints', String(complaint._id), JSON.stringify({ sn: complaint.sn, status: complaint.status, statusChanged: hasStatus, hasAdminResponse: Boolean(complaint.adminResponse) }));
    if (complaint.adminResponse && String(complaint.adminResponse).trim()) {
      const order = await Order.findOne({ sn: complaint.sn }).select('_id clientAccount').lean();
      if (order?.clientAccount) await createNotification({
        recipientRole: 'client', recipientId: order.clientAccount, type: 'complaint_reply',
        title: 'تم الرد على شكواك', message: 'الإدارة ردت على الشكوى الخاصة بالطلب ' + complaint.sn + '.',
        link: '/?tab=complaint', dedupeKey: 'complaint-reply:' + String(complaint._id) + ':' + String(complaint.updatedAt || Date.now())
      });
    }
    return res.json({ message: 'تم تحديث الشكوى بنجاح', complaint, data: complaint });
  } catch (err) { next(err); }
});

router.get('/counts', auth('admin'), async (req, res, next) => {
  try {
    const legacyFanniFilter = { $or: [ { role: 'fanni' }, { role: { $ne: 'admin' }, specialties: { $exists: true, $ne: [] }, adminRole: null } ] };
    const [technicians, verifiedTechnicians, clients] = await Promise.all([
      Fanni.countDocuments(legacyFanniFilter),
      Fanni.countDocuments({ ...legacyFanniFilter, status: 'معتمد' }),
      Client.countDocuments({})
    ]);
    return res.set('Cache-Control', 'no-store').json({
      counts: { technicians, verifiedTechnicians, clients }
    });
  } catch (err) { next(err); }
});

router.use(createAdminFanniProfilesRouter({
  auth,
  validate,
  Joi,
  Fanni,
  Rating,
  Order,
  bcrypt,
  createNotification,
  writeAdminAudit,
  publicFanni,
  validId,
  sendBadId,
  decision,
  adminName,
  MAX_LIST_LIMIT,
  reasonSchema
}));

router.get('/orders', auth('admin'), async (req, res, next) => {
  try {
    const filter = {};
    const status = String(req.query.status || '').trim();
    if (status) { filter.status = status; }
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIST_LIMIT) : MAX_LIST_LIMIT;
    const [orders, voiceOrders] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Order.find({ ...filter, voiceRecordingData: { $exists: true, $ne: '' } }).select('sn').lean()
    ]);
    const voiceOrderSNs = new Set(voiceOrders.map(order => String(order.sn || '').toUpperCase()));
    const safeOrders = orders.map(order => ({
      ...order,
      hasVoiceRecording: voiceOrderSNs.has(String(order.sn || '').toUpperCase())
    }));
    return res.json({ orders: safeOrders, data: safeOrders, items: safeOrders });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/approve', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.status(409).json({ message: 'الفني معلق. أعد تفعيله أولاً قبل القبول' }); }
    if (fanni.status === 'معتمد') { return res.json({ message: 'الفني معتمد بالفعل', fanni: publicFanni(fanni) }); }
    fanni.status = 'معتمد'; fanni.rejectionReason = undefined; fanni.suspensionReason = undefined; fanni.suspendedAt = undefined;
    fanni.decisions.push(decision(req, 'موافقة')); await fanni.save();
    await writeAdminAudit(req, 'اعتماد حساب فني', 'fannis', String(fanni._id), `name=${fanni.name}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: fanni._id, type: 'account_approved',
      title: 'تم اعتماد حسابك', message: 'مبروك، الإدارة اعتمدت حسابك وأصبحت تقدر تستخدم خدمات الفني المعتمدة.',
      link: '/fanni', dedupeKey: 'fanni-approved:' + String(fanni._id)
    });
    return res.json({ message: 'تم اعتماد الفني بنجاح', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.status(409).json({ message: 'لا يمكن رفض حساب معلق. أعده للمراجعة أولاً' }); }
    if (fanni.status === 'مرفوض') { return res.json({ message: 'الفني مرفوض بالفعل', fanni: publicFanni(fanni) }); }
    const reason = String(req.body.reason || '').trim();
    fanni.status = 'مرفوض'; fanni.rejectionReason = reason || undefined; fanni.decisions.push(decision(req, 'رفض', reason)); await fanni.save();
    await writeAdminAudit(req, 'رفض حساب فني', 'fannis', String(fanni._id), `name=${fanni.name}; reason=${reason}`);
    return res.json({ message: 'تم رفض الفني', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/disable', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status === 'معلق') { return res.json({ message: 'حساب الفني معلق بالفعل', fanni: publicFanni(fanni) }); }
    const reason = String(req.body.reason || '').trim();
    fanni.status = 'معلق'; fanni.suspensionReason = reason || undefined; fanni.suspendedAt = new Date(); fanni.decisions.push(decision(req, 'تعليق', reason)); await fanni.save();
    await writeAdminAudit(req, 'تعليق حساب فني', 'fannis', String(fanni._id), `reason=${reason}`);
    return res.json({ message: 'تم تعليق حساب الفني', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/enable', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    if (fanni.status !== 'معلق') { return res.json({ message: 'حساب الفني غير معلق', fanni: publicFanni(fanni) }); }
    const previousDecision = [...(fanni.decisions || [])].reverse().find(item => !['تعليق', 'إعادة تفعيل'].includes(item.action));
    if (previousDecision?.action === 'موافقة') { fanni.status = 'معتمد'; } else if (previousDecision?.action === 'رفض') { fanni.status = 'مرفوض'; } else { fanni.status = 'قيد المراجعة'; }
    fanni.suspensionReason = undefined; fanni.suspendedAt = undefined; fanni.decisions.push(decision(req, 'إعادة تفعيل')); await fanni.save();
    await writeAdminAudit(req, 'إعادة تفعيل حساب فني', 'fannis', String(fanni._id), `status=${fanni.status}`);
    return res.json({ message: 'تمت إعادة تفعيل الحساب', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fannis/:id/set-balance', auth('admin'), validate(Joi.object({ amount: amountSchema, reason: reasonSchema.optional() })), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    await session.withTransaction(async () => {
      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).session(session);
      if (!fanni) { outcome = null; return; }
      const amount = Number(req.body.amount);
      const previous = Number(fanni.walletBalance || 0);
      const reason = String(req.body.reason || '').trim();
      const difference = amount - previous;
      const updatedFanni = await Fanni.findOneAndUpdate({ _id: fanni._id, role: 'fanni' }, { $set: { walletBalance: amount }, $push: { decisions: decision(req, 'تسوية إدارية', `تعيين الرصيد من ${previous} إلى ${amount}. ${reason}`.trim()) } }, { new: true, session, runValidators: true });
      if (!updatedFanni) { throw new Error('SETTLEMENT_FANNI_NOT_FOUND'); }
      if (difference !== 0) {
        const transaction = new WalletTransaction({ fanni: fanni._id, type: 'admin_adjustment', amount: difference, balanceBefore: previous, balanceAfter: amount, description: `تسوية إدارية: من ${previous} إلى ${amount}. ${reason}`.trim().slice(0, 500), idempotencyKey: `admin-set-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}` });
        await transaction.save({ session });
      }
      outcome = { fanni: updatedFanni, balance: Number(updatedFanni.walletBalance) };
    });
    if (!outcome) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    await writeAdminAudit(req, 'تسوية رصيد محفظة فني', 'wallet', String(outcome.fanni._id), `balance=${outcome.balance}; reason=${String(req.body.reason || '').trim()}`);
    return res.json({ message: 'تم تحديث رصيد المحفظة وتسجيل التسوية', balance: outcome.balance, fanni: publicFanni(outcome.fanni) });
  } catch (err) { next(err); } finally { if (session) await session.endSession(); }
});

router.post('/fannis/:id/add-balance', auth('admin'), validate(Joi.object({ amount: Joi.number().strict().positive().max(100000000).required(), reason: reasonSchema.optional() })), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || '').trim();
    await session.withTransaction(async () => {
      const beforeFanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).session(session);
      if (!beforeFanni) { outcome = null; return; }
      const balanceBefore = Number(beforeFanni.walletBalance || 0);
      const fanni = await Fanni.findOneAndUpdate({ _id: beforeFanni._id, role: 'fanni' }, { $inc: { walletBalance: amount }, $push: { decisions: decision(req, 'تسوية إدارية', `إضافة ${amount} إلى المحفظة. ${reason}`.trim()) } }, { new: true, session, runValidators: true });
      if (!fanni) throw new Error('ADD_BALANCE_FANNI_NOT_FOUND');
      const transaction = new WalletTransaction({ fanni: fanni._id, type: 'admin_adjustment', amount, balanceBefore, balanceAfter: Number(fanni.walletBalance), description: `إضافة إدارية بمبلغ ${amount}. ${reason}`.trim().slice(0, 500), idempotencyKey: `admin-add-balance:${String(fanni._id)}:${crypto.randomBytes(16).toString('hex')}` });
      await transaction.save({ session });
      outcome = { fanni, balance: Number(fanni.walletBalance) };
    });
    if (!outcome) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    await writeAdminAudit(req, 'إضافة رصيد لمحفظة فني', 'wallet', String(outcome.fanni._id), `amount=${amount}; balance=${outcome.balance}; reason=${reason}`);
    return res.json({ message: 'تمت إضافة الرصيد وتسجيل الحركة المالية', balance: outcome.balance, fanni: publicFanni(outcome.fanni) });
  } catch (err) { next(err); } finally { if (session) await session.endSession(); }
});

router.get('/topup-requests', auth('admin'), async (req, res, next) => {
  try {
    const list = await TopupRequest.find({}).sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    const requests = list.map(publicTopup);
    return res.json({ requests, data: requests });
  } catch (err) { next(err); }
});

router.post('/topup-requests/:id/approve', auth('admin'), async (req, res, next) => {
  if (!validId(req.params.id)) return sendBadId(res);
  let session;
  try {
    session = await mongoose.startSession();
    let outcome = null;
    await session.withTransaction(async () => {
      const topup = await TopupRequest.findOneAndUpdate({ _id: req.params.id, status: 'قيد المراجعة', isCredited: false }, { $set: { status: 'مقبول', isCredited: true, reviewedAt: new Date(), reviewedBy: adminName(req), reviewReason: '' } }, { new: true, session });
      if (!topup) { outcome = { kind: 'not-pending' }; return; }
      const updatedFanni = await Fanni.findOneAndUpdate({ _id: topup.fanni, role: 'fanni' }, { $inc: { walletBalance: topup.amount }, $push: { decisions: decision(req, 'تسوية إدارية', `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`) } }, { new: true, session, runValidators: true });
      if (!updatedFanni) { throw new Error('TOPUP_FANNI_NOT_FOUND'); }
      const balanceAfter = Number(updatedFanni.walletBalance);
      const balanceBefore = balanceAfter - Number(topup.amount);
      const transaction = new WalletTransaction({ fanni: updatedFanni._id, type: 'topup', amount: Number(topup.amount), balanceBefore, balanceAfter, description: `شحن محفظة بمبلغ ${topup.amount} جنيه لطلب ${topup._id}`, idempotencyKey: `topup:${String(topup._id)}` });
      await transaction.save({ session });
      outcome = { kind: 'approved', topup, balance: balanceAfter };
    });
    if (outcome?.kind !== 'approved') {
      const current = await TopupRequest.findById(req.params.id).lean();
      if (!current) { return res.status(404).json({ message: 'طلب الشحن غير موجود' }); }
      return res.status(409).json({ message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة', status: current.status, isCredited: Boolean(current.isCredited) });
    }
    await writeAdminAudit(req, 'اعتماد طلب شحن محفظة', 'topups', String(outcome.topup._id), `fanniId=${String(outcome.topup.fanni)}; amount=${Number(outcome.topup.amount)}; balance=${outcome.balance}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: outcome.topup.fanni, type: 'topup_approved',
      title: 'تم شحن محفظتك', message: 'تم قبول طلب شحن المحفظة وإضافة ' + outcome.topup.amount + ' جنيه إلى رصيدك.',
      link: '/fanni', dedupeKey: 'topup-approved:' + String(outcome.topup._id)
    });
    return res.json({ message: 'تم قبول طلب الشحن وإضافة الرصيد مرة واحدة', request: publicTopup(outcome.topup), balance: outcome.balance });
  } catch (err) {
    if (err.message === 'TOPUP_FANNI_NOT_FOUND') { return res.status(409).json({ message: 'الفني المرتبط بطلب الشحن غير موجود. لم يتم اعتماد العملية' }); }
    next(err);
  } finally { if (session) await session.endSession(); }
});

router.post('/topup-requests/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const reason = String(req.body.reason || '').trim();
    const request = await TopupRequest.findOneAndUpdate({ _id: req.params.id, status: 'قيد المراجعة', isCredited: false }, { $set: { status: 'مرفوض', isCredited: false, reviewedAt: new Date(), reviewedBy: adminName(req), reviewReason: reason } }, { new: true, runValidators: true });
    if (!request) {
      const current = await TopupRequest.findById(req.params.id).lean();
      if (!current) { return res.status(404).json({ message: 'طلب الشحن غير موجود' }); }
      return res.status(409).json({ message: 'تمت معالجة طلب الشحن بالفعل أو أنه غير متاح للمراجعة', status: current.status });
    }
    await writeAdminAudit(req, 'رفض طلب شحن محفظة', 'topups', String(request._id), `fanniId=${String(request.fanni)}; amount=${Number(request.amount)}; reason=${reason}`);
    await createNotification({
      recipientRole: 'fanni', recipientId: request.fanni, type: 'topup_rejected',
      title: 'تم رفض طلب الشحن', message: 'تم رفض طلب شحن المحفظة. ' + String(request.reviewReason || '').slice(0, 180),
      link: '/fanni', dedupeKey: 'topup-rejected:' + String(request._id)
    });
    return res.json({ message: 'تم رفض طلب الشحن', request: publicTopup(request) });
  } catch (err) { next(err); }
});


router.patch('/orders/:sn/correct', auth('admin'), validate(Joi.object({
  clientName: Joi.string().trim().max(50).allow('').optional(),
  clientPhone: Joi.string().trim().min(10).max(20).required(),
  service: Joi.string().trim().min(2).max(100).required(),
  area: Joi.string().trim().min(2).max(250).required(),
  address: Joi.string().trim().max(250).allow('').optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  budget: Joi.string().trim().max(50).allow('').optional()
}).min(1)), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.status !== 'قيد المراجعة' || order.assignedFanni || (Array.isArray(order.offers) && order.offers.length > 0)) {
      return res.status(409).json({ message: 'لا يمكن تصحيح الطلب بعد نشره أو ارتباطه بعروض أو فني. التصحيح متاح قبل النشر فقط.' });
    }
    const phone = normalizePhone(req.body.clientPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(400).json({ message: 'رقم تليفون العميل غير صحيح. أدخل رقم موبايل مصري مكوّنًا من 11 رقمًا.' });
    }
    order.clientName = String(req.body.clientName || '').trim() || 'عميل';
    order.clientPhone = phone;
    order.service = String(req.body.service || '').trim();
    order.area = String(req.body.area || '').trim();
    order.address = String(req.body.address || '').trim();
    order.description = String(req.body.description || '').trim();
    order.budget = String(req.body.budget || '').trim();
    await order.save();
    await writeAdminAudit(req, 'تصحيح بيانات طلب', 'orders', sn, JSON.stringify({ service: order.service, area: order.area }));
    return res.json({ message: 'تم حفظ تصحيح بيانات الطلب. راجع البيانات ثم انشره عند التأكد.', order });
  } catch (err) { next(err); }
});

router.post('/orders/:sn/cancel', auth('admin'), validate(Joi.object({
  reason: reasonSchema.optional()
})), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (['تم الانتهاء', 'منتهي', 'تم اختيار فني', 'مؤرشف', 'ملغي'].includes(order.status) || order.commissionCharged) {
      return res.status(409).json({ message: 'لا يمكن إلغاء طلب منتهي أو معيّن لفني أو سبق خصم عمولته أو ملغي أو مؤرشف' });
    }
    order.status = 'ملغي';
    order.adminActionNote = String(req.body.reason || 'إلغاء إداري').trim().slice(0, 500);
    order.adminActionAt = new Date();
    order.adminActionBy = adminName(req);
    await order.save();
    await writeAdminAudit(req, 'إلغاء طلب إداري', 'orders', sn, `reason=${order.adminActionNote}`);
    return res.json({ message: 'تم إلغاء الطلب', order: { sn: order.sn, status: order.status } });
  } catch (err) { next(err); }
});

router.post('/orders/:sn/archive', auth('admin'), validate(Joi.object({
  reason: reasonSchema.optional()
})), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (['قيد المراجعة', 'تم النشر', 'وصلتك عروض', 'تم اختيار فني'].includes(order.status)) {
      return res.status(409).json({ message: 'لا يمكن أرشفة طلب نشط؛ ألغِ الطلب أو أنهِه أولًا' });
    }
    if (order.status === 'مؤرشف') return res.status(409).json({ message: 'الطلب مؤرشف بالفعل' });
    order.status = 'مؤرشف';
    order.adminActionNote = String(req.body.reason || 'أرشفة إدارية').trim().slice(0, 500);
    order.adminActionAt = new Date();
    order.adminActionBy = adminName(req);
    await order.save();
    await writeAdminAudit(req, 'أرشفة طلب', 'orders', sn, `reason=${order.adminActionNote}`);
    return res.json({ message: 'تمت أرشفة الطلب', order: { sn: order.sn, status: order.status } });
  } catch (err) { next(err); }
});

router.post('/orders/bulk-delete', auth('admin'), validate(Joi.object({
  sns: Joi.array().items(Joi.string().trim().uppercase().pattern(/^SN\d{6}$/)).min(1).max(100).unique().required()
}).required()), async (req, res, next) => {
  try {
    const sns = req.body.sns;
    const found = await Order.find({ sn: { $in: sns } }).select('_id sn status offers assignedFanni commissionCharged').lean();
    const foundBySn = new Map(found.map(order => [String(order.sn).toUpperCase(), order]));
    const deletedSns = [];
    const skipped = [];
    for (const sn of sns) {
      const order = foundBySn.get(sn);
      if (!order) { skipped.push({ sn, reason: 'الطلب غير موجود أو تم حذفه مسبقًا' }); continue; }
      const protectedStatuses = ['تم النشر', 'وصلتك عروض', 'تم اختيار فني', 'تم الانتهاء', 'منتهي'];
      if (protectedStatuses.includes(order.status) || order.assignedFanni || order.commissionCharged === true || (Array.isArray(order.offers) && order.offers.length > 0)) {
        skipped.push({ sn, reason: 'طلب نشط أو مرتبط بعرض أو فني؛ لم يُحذف حفاظًا على السجل' }); continue;
      }
      const hasCommissionTransaction = await WalletTransaction.exists({ order: order._id, type: 'commission' });
      if (hasCommissionTransaction) { skipped.push({ sn, reason: 'مرتبط بحركة مالية؛ لم يُحذف' }); continue; }
      const deleted = await Order.deleteOne({
        _id: order._id, status: 'قيد المراجعة', commissionCharged: { $ne: true },
        assignedFanni: { $in: [null] },
        $or: [{ offers: { $exists: false } }, { offers: { $size: 0 } }]
      });
      if (deleted.deletedCount === 1) deletedSns.push(sn);
      else skipped.push({ sn, reason: 'تغيرت حالة الطلب أثناء العملية؛ لم يُحذف' });
    }
    const message = deletedSns.length
      ? 'تم حذف ' + deletedSns.length + ' طلبًا. ' + (skipped.length ? 'تم تجاوز ' + skipped.length + ' طلب/طلبات محمية أو غير متاحة.' : '')
      : 'لم يتم حذف أي طلب؛ كل العناصر المحددة محمية أو غير موجودة.';
    await writeAdminAudit(req, 'حذف جماعي لطلبات', 'orders', deletedSns.join(','), 'المحذوف: ' + deletedSns.join(',') + '؛ المتجاوز: ' + skipped.map(x => x.sn + ' (' + x.reason + ')').join('; '));
    return res.json({ message, deleted: deletedSns.length, deletedSns, skipped });
  } catch (err) { next(err); }
});

router.delete('/orders/:sn', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(sn)) { return res.status(400).json({ message: 'رقم الطلب غير صالح' }); }
    const order = await Order.findOne({ sn });
    if (!order) { return res.status(404).json({ message: 'الطلب غير موجود' }); }
    const hasCommissionTransaction = await WalletTransaction.exists({ order: order._id, type: 'commission' });
    const hasAssignedFanni = Boolean(order.assignedFanni);
    const hasOffers = Array.isArray(order.offers) && order.offers.length > 0;
    const hasCommission = order.commissionCharged === true || Boolean(hasCommissionTransaction);
    const protectedStatuses = ['تم اختيار فني', 'تم الانتهاء'];
    const hasProtectedStatus = protectedStatuses.includes(order.status);
    const summary = { status: String(order.status || ''), hasAssignedFanni, offersCount: Array.isArray(order.offers) ? order.offers.length : 0, commissionCharged: order.commissionCharged === true, hasCommissionTransaction: Boolean(hasCommissionTransaction), hasFinancialOrTechnicianLinks: hasAssignedFanni || hasOffers || hasCommission || hasProtectedStatus };
    const deleted = await Order.deleteOne({ _id: order._id });
    if (deleted.deletedCount !== 1) { return res.status(409).json({ message: 'لم يتم حذف الطلب. حدّث القائمة وحاول مرة أخرى.' }); }
    await writeAdminAudit(req, 'حذف طلب إداري', 'orders', String(order.sn), JSON.stringify(summary));
    return res.json({ message: summary.hasFinancialOrTechnicianLinks ? 'تم حذف الطلب بعد التأكيد. احتُفظ بسجلات الحركات المالية وطلبات الشحن.' : 'تم حذف الطلب بنجاح.', deleted: 1, sn: order.sn, summary });
  } catch (err) { next(err); }
});

router.delete('/clients/:phone/account', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.params.phone || '').trim());
    if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح.' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'حساب العميل المسجل غير موجود.' });
    const activeOrder = await Order.exists({ clientPhone: phone, status: { $in: ['تم النشر', 'وصلتك عروض', 'تم اختيار فني'] } });
    if (activeOrder) return res.status(409).json({ message: 'لا يمكن حذف الحساب أثناء وجود طلب نشط. تم الحفاظ على الحساب وسجل الطلبات.' });
    await Client.deleteOne({ _id: client._id, phone });
    await writeAdminAudit(req, 'حذف حساب عميل', 'clients', phone, `clientId=${String(client._id)}; preservedOrderHistory=true`);
    return res.json({ message: 'تم حذف حساب العميل المسجل مع الحفاظ على سجل الطلبات التاريخي.' });
  } catch (err) { next(err); }
});

router.delete('/clients/:phone', auth('admin'), async (req, res, next) => {
  try {
    const rawPhone = String(req.params.phone || '').trim();
    const phone = normalizePhone(rawPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) { return res.status(400).json({ message: 'رقم هاتف العميل غير صالح. أدخل رقم موبايل مصري صحيحًا.' }); }
    const orders = await Order.find({ clientPhone: phone }).select('_id sn status assignedFanni commissionCharged').lean();
    if (orders.length === 0) { return res.status(404).json({ message: 'لا توجد طلبات مسجلة برقم الهاتف ده' }); }
    const orderIds = orders.map(order => order._id);
    const hasCommissionTransaction = await WalletTransaction.exists({ order: { $in: orderIds }, type: 'commission' });
    const protectedStatuses = ['تم اختيار فني', 'تم الانتهاء'];
    const hasProtectedOrder = orders.some(order => order.commissionCharged === true || Boolean(order.assignedFanni) || protectedStatuses.includes(order.status));
    if (hasProtectedOrder || hasCommissionTransaction) { return res.status(409).json({ message: 'لا يمكن حذف العميل لأن عنده طلبًا مرتبطًا بفني أو بعملية مالية. لم يتم حذف أي طلب.' }); }
    const result = await Order.deleteMany({ _id: { $in: orderIds }, clientPhone: phone, commissionCharged: { $ne: true }, assignedFanni: { $in: [null, undefined] }, status: { $nin: protectedStatuses } });
    if (result.deletedCount !== orders.length) { return res.status(409).json({ message: 'لم يتم حذف كل الطلبات المتوقعة؛ قد تكون بيانات تغيرت أثناء العملية. راجع الطلبات قبل إعادة المحاولة.', deleted: result.deletedCount }); }
    await writeAdminAudit(req, 'حذف طلبات عميل', 'clients', phone, `deletedOrders=${result.deletedCount}`);
    return res.json({ message: 'تم حذف طلبات العميل التجريبية بنجاح', deleted: result.deletedCount, phone });
  } catch (err) { next(err); }
});

router.delete('/fannis/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    const fanniId = fanni._id;
    const [topupCount, pendingTopupCount, transactionCount, relatedOrderCount, activeOrderCount] = await Promise.all([
      TopupRequest.countDocuments({ fanni: fanniId }),
      TopupRequest.countDocuments({ fanni: fanniId, status: 'قيد المراجعة' }),
      WalletTransaction.countDocuments({ fanni: fanniId }),
      Order.countDocuments({ $or: [{ assignedFanni: fanniId }, { 'offers.fanni': fanniId }] }),
      Order.countDocuments({ status: { $in: ['قيد المراجعة', 'تم النشر', 'وصلتك عروض', 'تم اختيار فني'] }, $or: [{ assignedFanni: fanniId }, { 'offers.fanni': fanniId }] })
    ]);
    const summary = { balance: Number(fanni.walletBalance || 0), topupCount, pendingTopupCount, transactionCount, relatedOrderCount, activeOrderCount };
    const deleted = await Fanni.deleteOne({ _id: fanniId, role: 'fanni' });
    if (deleted.deletedCount !== 1) { return res.status(409).json({ message: 'لم يتم حذف حساب الفني. حدّث القائمة وحاول مرة أخرى.' }); }
    await writeAdminAudit(req, 'حذف حساب فني', 'fannis', String(fanniId), `name=${fanni.name}; balance=${summary.balance}; transactions=${summary.transactionCount}; orders=${summary.relatedOrderCount}`);
    return res.json({ message: 'تم حذف حساب الفني. احتُفظ بسجلات الطلبات والشحنات والحركات المالية.', deleted: 1, fanniId: String(fanniId), summary });
  } catch (err) { next(err); }
});

const VALID_LEVELS = ['مبتدئ', 'ممارس', 'محترف', 'خبير مبتدئ', 'خبير', 'خبير أول', 'استشاري فني', 'نخبة', 'أسطوري'];
const VALID_BADGES = ['trusted', 'top_rated', 'verified', 'fast_response', 'premium', 'gold'];

// ترقية مستوى الفني - موثوق مع تاريخ
router.patch('/fannis/:id/level', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { level, reason } = req.body;
    if (!level || !VALID_LEVELS.includes(String(level).trim())) {
      return res.status(400).json({ message: 'المستوى غير صالح. القيم: ' + VALID_LEVELS.join(', ') });
    }
    const newLevel = String(level).trim();
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const oldLevel = fanni.level;
    if (oldLevel === newLevel) return res.json({ message: 'المستوى هو نفسه بالفعل', fanni: publicFanni(fanni) });
    fanni.level = newLevel;
    fanni.levelHistory.push({ from: oldLevel, to: newLevel, date: new Date(), by: adminName(req), byId: req.user?._id, reason: String(reason||'').slice(0,500) });
    fanni.decisions.push({ action: 'ترقية مستوى', reason: `من ${oldLevel} إلى ${newLevel}. ${String(reason||'').slice(0,400)}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { from: oldLevel, to: newLevel } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير مستوى فني', 'fannis', String(fanni._id), JSON.stringify({ from: oldLevel, to: newLevel, reason: String(reason || '').slice(0,400) }));
    return res.json({ message: `تمت ترقية المستوى من ${oldLevel} إلى ${newLevel}`, fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

// شارة الثقة - إضافة / إزالة
router.patch('/fannis/:id/badge', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { badge, action } = req.body;
    if (!badge || !VALID_BADGES.includes(String(badge).trim())) {
      return res.status(400).json({ message: 'الشارة غير صالحة. القيم: ' + VALID_BADGES.join(', ') });
    }
    const b = String(badge).trim();
    const act = String(action||'add').trim(); // add | remove | toggle
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const hasBadge = Array.isArray(fanni.badges) && fanni.badges.includes(b);
    if (act === 'add' || act === '' || act === 'toggle' && !hasBadge) {
      if (hasBadge) return res.json({ message: 'الشارة موجودة بالفعل', fanni: publicFanni(fanni) });
      fanni.badges.push(b);
      if (!fanni.badgesGrantedAt) fanni.badgesGrantedAt = new Map();
      fanni.badgesGrantedAt.set(b, new Date());
      fanni.decisions.push({ action: 'إضافة شارة', reason: `إضافة شارة ${b}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { badge: b } });
    } else {
      if (!hasBadge) return res.json({ message: 'الشارة غير موجودة', fanni: publicFanni(fanni) });
      fanni.badges = fanni.badges.filter(x=>x!==b);
      if (fanni.badgesGrantedAt && fanni.badgesGrantedAt.delete) fanni.badgesGrantedAt.delete(b);
      fanni.decisions.push({ action: 'إزالة شارة', reason: `إزالة شارة ${b}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { badge: b } });
    }
    await fanni.save();
    await writeAdminAudit(req, hasBadge && !(act === 'add' || act === '' || act === 'toggle' && !hasBadge) ? 'إزالة شارة فني' : 'إضافة شارة فني', 'fannis', String(fanni._id), `badge=${b}; action=${act}`);
    return res.json({ message: act.includes('add') ? 'تمت إضافة الشارة' : 'تمت إزالة الشارة', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

// ملاحظة داخلية
router.patch('/fannis/:id/note', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { note } = req.body;
    const clean = String(note||'').trim().slice(0,2000);
    if (!clean) return res.status(400).json({ message: 'الملاحظة لا يمكن أن تكون فارغة' });
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    fanni.adminNote = clean;
    fanni.adminNotesHistory.push({ note: clean, date: new Date(), by: adminName(req), byId: req.user?._id });
    fanni.decisions.push({ action: 'تعديل ملاحظة', reason: clean.slice(0,500), date: new Date(), by: adminName(req), byId: req.user?._id });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل ملاحظة فني', 'fannis', String(fanni._id), `noteLength=${clean.length}`);
    return res.json({ message: 'تم حفظ الملاحظة الداخلية', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

// حدود الاستقبال
router.patch('/fannis/:id/limit', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { maxOrders, maxOffers, dailyLimit, isLimited, reason } = req.body;
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const limits = fanni.limits || {};
    if (maxOrders !== undefined) {
      const v = Number(maxOrders);
      if (!Number.isInteger(v) || v < 0 || v > 1000) return res.status(400).json({ message: 'maxOrders يجب أن يكون 0-1000' });
      limits.maxOrders = v;
    }
    if (maxOffers !== undefined) {
      const v = Number(maxOffers);
      if (!Number.isInteger(v) || v < 0 || v > 1000) return res.status(400).json({ message: 'maxOffers يجب أن يكون 0-1000' });
      limits.maxOffers = v;
    }
    if (dailyLimit !== undefined) {
      const v = Number(dailyLimit);
      if (!Number.isInteger(v) || v < 0 || v > 100) return res.status(400).json({ message: 'dailyLimit يجب أن يكون 0-100' });
      limits.dailyLimit = v;
    }
    if (isLimited !== undefined) {
      if (typeof isLimited !== 'boolean') return res.status(400).json({ message: 'isLimited يجب أن يكون Boolean' });
      limits.isLimited = isLimited;
    }
    if (reason !== undefined) limits.reason = String(reason).slice(0,500);
    fanni.limits = limits;
    fanni.decisions.push({ action: 'تعديل حد', reason: `حدود: ${JSON.stringify(limits)}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: limits });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل حدود استقبال فني', 'fannis', String(fanni._id), JSON.stringify(limits));
    return res.json({ message: 'تم حفظ حدود الاستقبال', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

router.patch('/fannis/:id/profile-controls', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({
      trustScore: Joi.number().integer().min(0).max(100).optional(),
      isVerified: Joi.boolean().optional(),
      isFeatured: Joi.boolean().optional(),
      featuredUntil: Joi.date().iso().allow(null).optional()
    }).min(1).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'إعدادات الثقة والظهور غير صحيحة' });
    const rawFeaturedUntil = req.body?.featuredUntil;
    const dateOnly = typeof rawFeaturedUntil === 'string' && rawFeaturedUntil.length === 10 && rawFeaturedUntil[4] === '-' && rawFeaturedUntil[7] === '-';
    const normalizedFeaturedUntil = dateOnly ? new Date(String(rawFeaturedUntil) + 'T23:59:59.999Z') : value.featuredUntil;
    if (value.isFeatured === true && normalizedFeaturedUntil && new Date(normalizedFeaturedUntil) <= new Date()) {
      return res.status(400).json({ message: 'تاريخ انتهاء التمييز يجب أن يكون اليوم أو تاريخًا مستقبليًا' });
    }
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const before = { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil };
    if (value.trustScore !== undefined) fanni.trustScore = value.trustScore;
    if (value.isVerified !== undefined) {
      fanni.isVerified = value.isVerified;
      const badges = new Set(Array.isArray(fanni.badges) ? fanni.badges : []);
      if (value.isVerified) badges.add('verified'); else badges.delete('verified');
      fanni.badges = Array.from(badges);
    }
    if (value.isFeatured !== undefined) fanni.isFeatured = value.isFeatured;
    if (Object.prototype.hasOwnProperty.call(value, 'featuredUntil')) fanni.featuredUntil = normalizedFeaturedUntil || undefined;
    if (fanni.isFeatured === false) fanni.featuredUntil = undefined;
    fanni.decisions.push({
      action: 'تعديل الثقة والظهور',
      reason: 'تحديث إعدادات الثقة والتحقق والتمييز من لوحة الإدارة',
      date: new Date(), by: adminName(req), byId: req.user?._id,
      meta: { before, after: { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil } }
    });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل الثقة والظهور', 'fannis', String(fanni._id), JSON.stringify({ before, after: { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil } }));
    return res.json({ message: 'تم حفظ درجة الثقة والتحقق والظهور', fanni: publicFanni(fanni) });
  } catch (error) { next(error); }
});

// ===== عروض الطلبات - بناء على Order.js الجديد =====
router.get('/orders/:sn/offers', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب يجب أن يكون SN + 6 أرقام' });
    const order = await Order.findOne({ sn }).populate('offers.fanni', 'name phone').lean();
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    return res.json({ sn: order.sn, status: order.status, offers: order.offers || [], count: (order.offers||[]).length });
  } catch(e){ next(e); }
});

router.delete('/offers/:sn/:idx', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    const idx = Number(req.params.idx);
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن حذف عرض بعد خصم العمولة' });
    if (['تم اختيار فني','تم الانتهاء'].includes(order.status)) return res.status(409).json({ message: 'الطلب في حالة محمية لا يمكن حذف عروضه' });
    if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
    const removed = order.offers[idx];
    order.offers.splice(idx,1);
    // لو العرض المحذوف هو المعين، الغي التعيين
    if (order.acceptedOfferId && String(order.acceptedOfferId) === String(removed._id)) {
      order.assignedFanni = null;
      order.assignedFanniName = '';
      order.acceptedOfferId = null;
      order.acceptedOfferPrice = null;
      if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
    }
    await order.save();
    await writeAdminAudit(req, 'حذف عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(removed.fanni || ''), price: removed.price, status: order.status }));
    return res.json({ message: 'تمت إزالة العرض', removed, offers: order.offers });
  } catch(e){ next(e); }
});

router.post('/offers/:sn/:idx/reject', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    const idx = Number(req.params.idx);
    const reason = String(req.body.reason||'غير مناسب').slice(0,500);
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن رفض عرض بعد خصم العمولة' });
    if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
    const offer = order.offers[idx];
    // نعتبر الرفض = حذف مع تسجيل سبب في قرار لو الفني موجود
    if (offer.fanni) {
      const fanni = await Fanni.findById(offer.fanni);
      if (fanni) {
        fanni.decisions.push({ action: 'رفض', reason: `رفض عرض على ${sn}: ${reason}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sn, offerId: offer._id } });
        await fanni.save();
      }
    }
    order.offers.splice(idx,1);
    if (order.acceptedOfferId && String(order.acceptedOfferId) === String(offer._id)) {
      order.assignedFanni = null;
      order.acceptedOfferId = null;
      order.acceptedOfferPrice = null;
      if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
    }
    await order.save();
    await writeAdminAudit(req, 'رفض عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(offer.fanni || ''), price: offer.price, reason }));
    return res.json({ message: 'تم رفض العرض وإزالته', reason, offers: order.offers });
  } catch(e){ next(e); }
});

function notImplemented(msg){ return (req,res)=>res.status(501).json({message: msg}); }

const ADMIN_ROLES = ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'];
function isRootAdmin(user) {
  const configuredPhone = normalizePhone(String(process.env.ADMIN_PHONE || ''));
  return Boolean(user && user.role === 'admin' && configuredPhone && normalizePhone(String(user.phone || '')) === configuredPhone);
}
function requireRootAdmin(req, res) {
  if (!isRootAdmin(req.user)) {
    res.status(403).json({ message: 'إدارة المناصب محصورة في المدير العام' });
    return false;
  }
  return true;
}
function publicAdminUser(user) {
  return { id: String(user._id), name: user.name, phone: user.phone, role: user.role, isRootAdmin: isRootAdmin(user), adminRole: user.adminRole || (isRootAdmin(user) ? 'مدير عام' : (user.role === 'admin' ? 'مشرف' : null)), status: user.status, adminPermissions: user.adminPermissions || {} };
}
router.get('/me', auth('admin'), async (req, res) => {
  const role = isRootAdmin(req.user) ? 'أدمن رئيسي' : (req.user.adminRole || '');
  return res.set('Cache-Control', 'no-store').json({
    id: String(req.user._id),
    name: req.user.name,
    role: req.user.role,
    adminRole: req.user.adminRole || null,
    adminRoleLabel: role,
    adminPermissions: req.user.adminPermissions || {}
  });
});

router.get('/admin-users', auth('admin'), async (req, res, next) => {
  try {
    const users = await Fanni.find({ $or: [{ role: 'admin' }, { adminRole: { $in: ADMIN_ROLES } }] })
      .select('name phone role adminRole adminPermissions status').sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    return res.json({ users: users.map(publicAdminUser), data: users.map(publicAdminUser) });
  } catch (err) { next(err); }
});
router.post('/admin-users', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    const fanniId = String(req.body?.fanniId || '');
    const adminRole = String(req.body?.role || '');
    if (!validId(fanniId)) return sendBadId(res);
    if (!ADMIN_ROLES.includes(adminRole)) return res.status(400).json({ message: 'المنصب الإداري غير صالح' });
    const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود' });
    if (fanni.status !== 'معتمد') return res.status(409).json({ message: 'لا يمكن ترقية فني غير معتمد أو موقوف' });
    if (fanni.adminRole === adminRole) return res.status(409).json({ message: 'الفني يشغل هذا المنصب بالفعل' });
    const previous = fanni.adminRole || '';
    fanni.adminRole = adminRole;
    fanni.decisions.push({ action: previous ? 'تغيير منصب إداري' : 'ترقية إداري', reason: previous ? `من ${previous} إلى ${adminRole}` : `تعيين ${adminRole}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous, newRole: adminRole } });
    await fanni.save();
    await writeAdminAudit(req, 'تعيين منصب إداري', 'admin-users', String(fanni._id), JSON.stringify({ name: fanni.name, previousRole: previous, newRole: adminRole }));
    return res.status(201).json({ message: `تم تعيين ${fanni.name} بمنصب ${adminRole} مع الاحتفاظ بحساب الفني`, user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});
router.patch('/admin-users/:id/role', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const adminRole = String(req.body?.role || '');
    if (!ADMIN_ROLES.includes(adminRole)) return res.status(400).json({ message: 'المنصب الإداري غير صالح' });
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || !((fanni.role === 'fanni' && fanni.adminRole) || fanni.role === 'admin')) return res.status(404).json({ message: 'المشرف غير موجود' });
    const previous = fanni.adminRole || 'مشرف';
    if (previous === adminRole && fanni.adminRole) return res.json({ message: 'المنصب لم يتغير', user: publicAdminUser(fanni) });
    fanni.adminRole = adminRole;
    fanni.decisions.push({ action: 'تغيير منصب إداري', reason: `من ${previous} إلى ${adminRole}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous, newRole: adminRole } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير منصب إداري', 'admin-users', String(fanni._id), JSON.stringify({ previousRole: previous, newRole: adminRole }));
    return res.json({ message: `تم تغيير المنصب إلى ${adminRole}`, user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});
router.patch('/admin-users/:id/permissions', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const permissions = req.body?.permissions;
    const allowedSections = ['dashboard','fannis','orders','publishOrders','voiceReview','passwordRecovery','complaints','services','clients','topups','wallet','pricing','settings','content','support','regions','offers','notifications','clientsData'];
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ message: 'قائمة الصلاحيات غير صحيحة' });
    }
    const cleanInput = {};
    for (const key of allowedSections) {
      const item = permissions[key] || {};
      if (typeof item.read !== 'boolean' || typeof item.write !== 'boolean') {
        return res.status(400).json({ message: 'يجب تحديد القراءة والتنفيذ لكل قسم' });
      }
      cleanInput[key] = { read: item.read || item.write, write: item.write };
    }
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || (fanni.role !== 'admin' && (fanni.role !== 'fanni' || !ADMIN_ROLES.includes(fanni.adminRole)))) {
      return res.status(404).json({ message: 'حساب المشرف غير موجود' });
    }
    const role = fanni.adminRole || (fanni.role === 'admin' ? 'مشرف' : '');
    const defaults = defaultAdminPermissions(role);
    const overrides = { __customOverrides: true };
    for (const key of ADMIN_PERMISSION_KEYS) {
      const desired = cleanInput[key] || { read: false, write: false };
      const base = defaults[key] || { read: false, write: false };
      const delta = {};
      if (desired.read !== base.read) delta.read = desired.read;
      if (desired.write !== base.write) delta.write = desired.write;
      if (Object.keys(delta).length) overrides[key] = delta;
    }
    fanni.adminPermissions = overrides;
    const changedSections = Object.keys(overrides).filter(key => key !== '__customOverrides');
    fanni.decisions.push({ action: 'تغيير صلاحيات إدارية', reason: 'تحديث الاستثناءات الفردية فوق الصلاحيات الافتراضية للمنصب', date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sections: changedSections } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير صلاحيات إدارية', 'admin-users', String(fanni._id), JSON.stringify({ role, changedSections }));
    return res.json({ message: 'تم حفظ الصلاحيات المخصصة بنجاح', user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});
router.delete('/admin-users/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || !((fanni.role === 'fanni' && fanni.adminRole) || fanni.role === 'admin')) return res.status(404).json({ message: 'المشرف غير موجود' });
    const previous = fanni.adminRole || 'مشرف قديم';
    fanni.adminRole = null;
    // Legacy accounts whose role is still 'admin' must remain unable to enter
    // admin APIs after revocation; never convert them into technician accounts.
    if (fanni.role === 'admin') {
      fanni.adminPermissions = { __customOverrides: true, ...Object.fromEntries(ADMIN_PERMISSION_KEYS.map(key => [key, { read: false, write: false }])) };
    }
    fanni.decisions.push({ action: 'سحب صلاحية إدارية', reason: `سحب منصب ${previous} مع الاحتفاظ بالحساب`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous } });
    await fanni.save();
    await writeAdminAudit(req, 'سحب صلاحية إدارية', 'admin-users', String(fanni._id), `previousRole=${previous}`);
    return res.json({ message: 'تم سحب الصلاحية الإدارية، وحساب الفني ما زال فعالًا', user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});
async function getAdminConfig() {
  let config = await AdminConfig.findOne({ key: 'main' });
  if (!config) config = await AdminConfig.create({ key: 'main' });
  return config;
}
async function writeAdminAudit(req, action, category, target, details) {
  try {
    await AdminAuditLog.create({
      action: String(action || '').slice(0, 100),
      category: String(category || 'admin').slice(0, 50),
      target: String(target || '').slice(0, 200),
      details: String(details || '').slice(0, 1000),
      adminName: adminName(req),
      adminId: String(req.user?._id || ''),
      ip: String(req.ip || '').slice(0, 80)
    });
  } catch (err) { console.error('Could not write admin audit log:', err.message); }
}
router.get('/audit-logs', auth('admin'), async (req, res, next) => {
  try {
    const query = {};
    if (req.query.date) {
      const date = new Date(String(req.query.date) + 'T00:00:00.000Z');
      if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'التاريخ غير صالح' });
      const end = new Date(date); end.setUTCDate(end.getUTCDate() + 1);
      query.createdAt = { $gte: date, $lt: end };
    }
    const logs = await AdminAuditLog.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return res.set('Cache-Control', 'no-store').json({ logs, items: logs });
  } catch (err) { next(err); }
});
router.get('/pricing', auth('admin'), async (req, res, next) => {
  try {
    const config = await getAdminConfig();
    return res.set('Cache-Control', 'no-store').json({ pricing: config.pricing, history: config.history.filter(x => x.key === 'pricing').slice(-100).reverse() });
  } catch (err) { next(err); }
});
router.put('/pricing', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      check: Joi.number().min(0).max(100000).required(),
      commission: Joi.number().min(0).max(100).required(),
      minOffer: Joi.number().integer().min(1).max(1000000).required(),
      maxOffer: Joi.number().integer().min(1).max(1000000).required()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'تحقق من رسوم الفرصة والعمولة والحدود السعرية' });
    if (value.minOffer > value.maxOffer) return res.status(400).json({ message: 'الحد الأدنى لا يمكن أن يكون أكبر من الحد الأقصى' });
    const config = await getAdminConfig();
    const before = config.pricing.toObject ? config.pricing.toObject() : { ...config.pricing };
    config.pricing = value;
    config.history.push({ key: 'pricing', before, after: value, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل الأسعار من لوحة الإدارة', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'تعديل الأسعار والعمولات', 'pricing', 'pricing', JSON.stringify({ before, after: value }));
    return res.json({ message: 'تم حفظ الأسعار وسجل التغيير', pricing: config.pricing, history: config.history.filter(x => x.key === 'pricing').slice(-100).reverse() });
  } catch (err) { next(err); }
});
router.post('/orders/:sn/assign', auth('admin'), async (req, res, next) => {
  let session;
  let committed = false;
  let notification = null;
  try {
    if (!requireRootAdmin(req, res)) return;
    const sn = String(req.params.sn || '').trim().toUpperCase();
    const offerId = String(req.body?.offerId || '');
    const reason = String(req.body?.reason || '').trim();
    if (!/^SN\d{6}$/.test(sn) || !mongoose.isValidObjectId(offerId)) return res.status(400).json({ message: 'كود الطلب أو العرض غير صحيح' });
    if (reason.length < 3 || reason.length > 500) return res.status(400).json({ message: 'سبب التعيين مطلوب من 3 إلى 500 حرف' });
    session = await mongoose.startSession();
    session.startTransaction();
    const order = await Order.findOne({ sn }).session(session);
    if (!order) { await session.abortTransaction(); return res.status(404).json({ message: 'الطلب غير موجود' }); }
    if (!['تم النشر', 'وصلتك عروض'].includes(order.status) || order.commissionCharged || (order.expiresAt && order.expiresAt <= new Date())) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'الطلب ليس متاحًا للتعيين أو انتهت مدته أو سبق خصم العمولة' });
    }
    const offer = order.offers.id(offerId);
    if (!offer || !offer.fanni) { await session.abortTransaction(); return res.status(404).json({ message: 'العرض أو حساب الفني غير موجود' }); }
    const price = Number(offer.priceNum);
    if (!Number.isFinite(price) || price <= 0) { await session.abortTransaction(); return res.status(400).json({ message: 'سعر العرض غير صالح' }); }
    const config = await AdminConfig.findOne({ key: 'main' }).select('pricing').session(session).lean();
    const pricing = config?.pricing || { commission: 10, minOffer: 1, maxOffer: 1000000 };
    if (price < Number(pricing.minOffer || 1) || price > Number(pricing.maxOffer || 1000000)) { await session.abortTransaction(); return res.status(409).json({ message: 'سعر العرض خارج الحدود الحالية' }); }
    const rate = Number(pricing.commission ?? 10);
    const commission = Math.round((price * rate / 100 + Number.EPSILON) * 100) / 100;
    const before = await Fanni.findOne({ _id: offer.fanni, role: 'fanni', status: 'معتمد', isFrozen: { $ne: true } }).session(session);
    if (!before) { await session.abortTransaction(); return res.status(409).json({ message: 'الفني غير معتمد أو محفظته مجمدة' }); }
    const balanceBefore = Number(before.walletBalance || 0);
    if (!Number.isFinite(balanceBefore) || balanceBefore < commission) { await session.abortTransaction(); return res.status(409).json({ message: 'رصيد محفظة الفني غير كافٍ للعمولة', requiredCommission: commission, walletBalance: balanceBefore || 0 }); }
    const after = await Fanni.findOneAndUpdate(
      { _id: before._id, role: 'fanni', status: 'معتمد', isFrozen: { $ne: true }, walletBalance: { $gte: commission } },
      { $inc: { walletBalance: -commission } }, { new: true, session, runValidators: true }
    );
    if (!after) { await session.abortTransaction(); return res.status(409).json({ message: 'الرصيد تغيّر؛ لم يتم التعيين أو الخصم' }); }
    const update = await Order.updateOne(
      { _id: order._id, status: { $in: ['تم النشر', 'وصلتك عروض'] }, commissionCharged: { $ne: true }, 'offers._id': offerId },
      { $set: { assignedFanni: before._id, assignedFanniName: offer.fanniName || before.name, acceptedOfferId: offer._id, acceptedOfferPrice: price, commissionRate: rate, commissionAmount: commission, commissionCharged: true, commissionChargedAt: new Date(), status: 'تم اختيار فني', adminActionNote: reason, adminActionAt: new Date(), adminActionBy: adminName(req) } },
      { session, runValidators: true }
    );
    if (update.modifiedCount !== 1) { await session.abortTransaction(); return res.status(409).json({ message: 'تغيرت حالة الطلب؛ لم يتم تثبيت الخصم' }); }
    await new WalletTransaction({
      fanni: before._id, order: order._id, orderSN: order.sn, type: 'commission', amount: -commission,
      balanceBefore, balanceAfter: Number(after.walletBalance),
      description: 'عمولة منصة صُنّاع للتعيين الإداري على الطلب ' + order.sn,
      idempotencyKey: 'commission:' + String(order._id)
    }).save({ session });
    await session.commitTransaction();
    committed = true;
    notification = { fanniId: before._id, clientId: order.clientAccount, sn: order.sn, name: before.name };
    await writeAdminAudit(req, 'تعيين فني وخصم العمولة', 'orders', sn, reason + '؛ الفني: ' + before.name + '؛ العمولة: ' + commission);
    return res.json({ message: 'تم تعيين الفني وتسجيل خصم العمولة', orderSN: sn, fanniName: before.name, commission: { rate, amount: commission } });
  } catch (err) {
    if (session && session.inTransaction()) { try { await session.abortTransaction(); } catch (_) {} }
    return next(err);
  } finally {
    if (session) await session.endSession();
    if (committed && notification) {
      try {
        await createNotification({ recipientRole: 'fanni', recipientId: notification.fanniId, type: 'admin_assignment', title: 'تم تعيينك على طلب', message: 'تم تعيينك على الطلب ' + notification.sn, link: '/fanni', dedupeKey: 'admin-assignment-fanni:' + notification.sn });
        if (notification.clientId) await createNotification({ recipientRole: 'client', recipientId: notification.clientId, type: 'technician_assigned', title: 'تم تعيين فني على طلبك', message: 'تم تعيين ' + notification.name + ' على الطلب ' + notification.sn, link: '/?tab=orders', dedupeKey: 'admin-assignment-client:' + notification.sn });
      } catch (notifyError) { console.error('Assignment notification failed:', notifyError.message); }
    }
  }
});

router.get('/wallet/transactions/:fanniId', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.fanniId)) return sendBadId(res);
    const list = await WalletTransaction.find({fanni:req.params.fanniId}).sort({createdAt:-1}).limit(100).lean();
    return res.json({transactions:list, data:list});
  }catch(e){next(e);}
});

// تجميد المحفظة - يستخدم حقول isFrozen من Fanni.js الجديد
router.post('/wallet/freeze/:id', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({
      action: Joi.string().valid('freeze', 'unfreeze').default('freeze'),
      reason: Joi.string().trim().max(500).allow('').default('')
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'إجراء تجميد المحفظة أو سبب الإجراء غير صالح' });
    const act = value.action;
    const r = value.reason;
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    if (act === 'freeze') {
      if (fanni.isFrozen) return res.json({ message: 'المحفظة مجمدة بالفعل', fanni: publicFanni(fanni) });
      fanni.isFrozen = true;
      fanni.frozenAt = new Date();
      fanni.frozenReason = r;
      fanni.frozenBy = adminName(req);
      fanni.decisions.push({ action: 'تجميد محفظة', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    } else {
      if (!fanni.isFrozen) return res.json({ message: 'المحفظة غير مجمدة', fanni: publicFanni(fanni) });
      fanni.isFrozen = false;
      fanni.frozenAt = undefined;
      fanni.frozenReason = undefined;
      fanni.frozenBy = undefined;
      fanni.decisions.push({ action: 'إلغاء تجميد', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    }
    await fanni.save();
    await writeAdminAudit(req, act === 'freeze' ? 'تجميد محفظة فني' : 'إلغاء تجميد محفظة فني', 'wallet', String(fanni._id), `name=${fanni.name}; reason=${r}`);
    return res.json({ message: act==='freeze' ? 'تم تجميد المحفظة' : 'تم إلغاء تجميد المحفظة', fanni: publicFanni(fanni) });
  }catch(e){next(e);}
});

router.post('/clients/:phone/block', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح' });
    const schema = Joi.object({ reason: Joi.string().trim().min(2).max(500).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) return res.status(400).json({ message: 'اكتب سبب الحظر من حرفين إلى 500 حرف' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'لا يوجد حساب عميل مسجل بهذا الرقم. الطلبات المنشأة دون حساب لا يمكن حظرها من هذه الخاصية.' });
    if (client.status === 'معلق') return res.json({ message: 'حساب العميل معلق بالفعل', client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
    client.status = 'معلق';
    await client.save();
    await writeAdminAudit(req, 'حظر حساب عميل', 'clients', phone, `clientId=${String(client._id)}; reason=${value.reason}`);
    return res.json({ message: 'تم تعليق حساب العميل ومنعه من تسجيل الدخول واستخدام المسارات المحمية. سبب الإجراء: ' + value.reason, client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
  } catch (error) { return next(error); }
});

router.post('/clients/:phone/unblock', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'لا يوجد حساب عميل مسجل بهذا الرقم' });
    if (client.status !== 'معلق') return res.json({ message: 'حساب العميل نشط بالفعل', client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
    client.status = 'نشط';
    await client.save();
    await writeAdminAudit(req, 'إلغاء حظر حساب عميل', 'clients', phone, `clientId=${String(client._id)}`);
    return res.json({ message: 'تمت إعادة تفعيل حساب العميل', client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
  } catch (error) { return next(error); }
});

router.post('/clients/:phone/note', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح' });
    const schema = Joi.object({ note: Joi.string().trim().min(1).max(2000).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) return res.status(400).json({ message: 'الملاحظة مطلوبة وبحد أقصى 2000 حرف' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'لا يوجد حساب عميل مسجل بهذا الرقم لحفظ الملاحظة عليه' });
    const note = value.note.trim();
    client.adminNote = note;
    client.adminNotesHistory.push({ note, date: new Date(), by: adminName(req), byId: req.user?._id });
    await client.save();
    return res.json({ message: 'تم حفظ الملاحظة الداخلية وسجلها', client: { id: String(client._id), name: client.name, phone: client.phone, adminNote: client.adminNote } });
  } catch (error) { return next(error); }
});
const ADMIN_LAYOUT_SECTIONS = {
  dashboard: ['dashboard', 'stats'],
  clients: ['clients', 'orders'],
  technicians: ['fannis', 'pending', 'profileEdits', 'disabled', 'levels', 'offers', 'wallets', 'topups'],
  'service-management': ['services', 'regions'],
  'customer-operations': ['complaints', 'support', 'notifications', 'content'],
  'platform-admin': ['pricing', 'reports', 'pageVisits', 'security', 'settings', 'roles']
};
const ADMIN_LAYOUT_TABS = Object.values(ADMIN_LAYOUT_SECTIONS).flat();
router.use(createAdminUiLayoutRouter({ Joi, auth, getAdminConfig, adminName, writeAdminAudit }));

router.use(createAdminServicesRouter({
  Service,
  CATEGORIES,
  findCategoryByService,
  findCategoryByLabel,
  mongoose,
  Joi,
  auth,
  writeAdminAudit
}));
router.use(createAdminPlatformRouter({
  auth,
  Joi,
  getAdminConfig,
  writeAdminAudit,
  adminName,
  Order,
  Complaint,
  Client,
  Rating,
  Fanni,
  AdminAuditLog,
  PageVisit,
  normalizePhone,
  bcrypt
}));
router.use(createAdminOperationsRouter({
  Region,
  Joi,
  adminName,
  writeAdminAudit,
  auth,
  mongoose,
  normalizePhone,
  Fanni,
  Client,
  Notification
}));

module.exports = router;
