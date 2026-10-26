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
    const token = jwt.sign({ id: admin._id, role: admin.role, adminRole: admin.adminRole || null }, process.env.JWT_SECRET, { expiresIn: ADMIN_TOKEN_EXPIRY });
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

router.patch('/fannis/:id/password', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({ newPassword: Joi.string().min(8).max(128).required(), confirmPassword: Joi.string().required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error || value.newPassword !== value.confirmPassword) return res.status(400).json({ message: 'كلمة السر يجب ألا تقل عن 8 أحرف، والتأكيد يجب أن يطابقها.' });
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).select('+passwordHash');
    if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });
    fanni.passwordHash = await bcrypt.hash(value.newPassword, 12);
    await fanni.save();
    await writeAdminAudit(req, 'تغيير كلمة سر فني', 'fannis', String(fanni._id), 'تغيير كلمة سر الحساب من لوحة الإدارة دون تسجيل كلمة السر');
    return res.json({ message: 'تم تغيير كلمة سر الفني بنجاح.' });
  } catch (err) { next(err); }
});

router.get('/fannis', auth('admin'), async (req, res, next) => {
  try {
    const list = await Fanni.find({ $or: [ { role: 'fanni' }, { role: { $ne: 'admin' }, specialties: { $exists: true, $ne: [] }, adminRole: null } ] }).select('-passwordHash').sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    const ids = list.map(item => item._id);
    const [ratingStats, completedStats] = ids.length ? await Promise.all([
      Rating.aggregate([
        { $match: { fanniId: { $in: ids }, reviewerRole: 'client' } },
        { $group: { _id: '$fanniId', average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { assignedFanni: { $in: ids }, status: 'تم الانتهاء' } },
        { $group: { _id: '$assignedFanni', count: { $sum: 1 } } }
      ])
    ]) : [[], []];
    const ratingsById = new Map(ratingStats.map(item => [String(item._id), item]));
    const completedById = new Map(completedStats.map(item => [String(item._id), item.count]));
    const fannis = list.map(item => {
      const result = publicFanni(item);
      const rating = ratingsById.get(String(item._id));
      result.ratingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
      result.ratingCount = rating?.count || 0;
      result.completedJobs = completedById.get(String(item._id)) || 0;
      return result;
    });
    return res.set('Cache-Control', 'no-store').json({ fannis, data: fannis });
  } catch (err) { next(err); }
});

router.get('/fanni-profile-edits', auth('admin'), async (req, res, next) => {
  try {
    const fannis = await Fanni.find({ role: 'fanni', 'pendingProfileChange.requestedAt': { $exists: true, $ne: null } }).select('-passwordHash').sort({ 'pendingProfileChange.requestedAt': 1 }).limit(MAX_LIST_LIMIT).lean();
    return res.set('Cache-Control', 'no-store').json({ requests: fannis.map(item => ({ _id: item._id, name: item.name, phone: item.phone, specialties: item.specialties || [], areas: item.areas || [], pendingProfileChange: item.pendingProfileChange, status: item.status, createdAt: item.createdAt })) });
  } catch (err) { next(err); }
});

router.post('/fanni-profile-edits/:id/approve', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni || !fanni.pendingProfileChange?.requestedAt) return res.status(404).json({ message: 'طلب تعديل البيانات غير موجود أو تمت مراجعته بالفعل' });
    const pending = fanni.pendingProfileChange;
    const duplicate = await Fanni.findOne({ phone: pending.phone, _id: { $ne: fanni._id } }).select('_id');
    if (duplicate) return res.status(409).json({ message: 'رقم الهاتف المطلوب أصبح مسجلًا في حساب آخر. ارفض الطلب واطلب من الفني رقمًا آخر.' });
    const before = { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas };
    fanni.phone = pending.phone; fanni.specialties = pending.specialties; fanni.areas = pending.areas;
    fanni.pendingProfileChange = undefined;
    fanni.decisions.push(decision(req, 'اعتماد تعديل بيانات', 'اعتماد طلب تعديل بيانات الفني'));
    fanni.decisions[fanni.decisions.length - 1].meta = { before, after: { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas } };
    await fanni.save();
    await createNotification({ recipientRole: 'fanni', recipientId: fanni._id, type: 'profile_change_approved', title: 'تمت الموافقة على تعديل بياناتك', message: 'وافقت الإدارة على طلب تعديل بيانات حسابك وتم تحديث البيانات.', link: '/fanni', dedupeKey: 'profile-change-approved:' + String(fanni._id) + ':' + Date.now() });
    return res.json({ message: 'تم اعتماد تعديل بيانات الفني بنجاح', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fanni-profile-edits/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni || !fanni.pendingProfileChange?.requestedAt) return res.status(404).json({ message: 'طلب تعديل البيانات غير موجود أو تمت مراجعته بالفعل' });
    const reason = String(req.body.reason || 'لم تتم الموافقة على الطلب').trim().slice(0, 500);
    fanni.pendingProfileChange = undefined;
    fanni.decisions.push(decision(req, 'رفض تعديل بيانات', reason));
    await fanni.save();
    await createNotification({ recipientRole: 'fanni', recipientId: fanni._id, type: 'profile_change_rejected', title: 'لم تتم الموافقة على تعديل بياناتك', message: 'رفضت الإدارة طلب تعديل البيانات. السبب: ' + reason, link: '/fanni', dedupeKey: 'profile-change-rejected:' + String(fanni._id) + ':' + Date.now() });
    return res.json({ message: 'تم رفض طلب تعديل البيانات وإبقاء البيانات الأصلية كما هي' });
  } catch (err) { next(err); }
});

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
    return res.json({ message: `تم تغيير المنصب إلى ${adminRole}`, user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});
router.patch('/admin-users/:id/permissions', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const permissions = req.body?.permissions;
    const allowedSections = ['dashboard','fannis','orders','publishOrders','complaints','services','clients','topups','wallet','pricing','settings','content','support','regions','offers','notifications','clientsData'];
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
    fanni.decisions.push({ action: 'تغيير صلاحيات إدارية', reason: 'تحديث الاستثناءات الفردية فوق الصلاحيات الافتراضية للمنصب', date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sections: Object.keys(overrides).filter(key => key !== '__customOverrides') } });
    await fanni.save();
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
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'تعيين الفني وخصم العمولة إجراء مالي متاح للمدير العام فقط' });
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
    const { reason, action } = req.body;
    const act = String(action||'freeze').toLowerCase();
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const r = String(reason||'').slice(0,500);
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
router.get('/regions', auth('admin'), async (req, res, next) => {
  try {
    const regions = await Region.find({}).sort({ isActive: -1, name: 1 }).limit(500).lean();
    return res.set('Cache-Control', 'no-store').json({ regions, items: regions });
  } catch (error) { return next(error); }
});

router.post('/regions', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({ name: Joi.string().trim().min(2).max(100).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'اسم المنطقة مطلوب من حرفين إلى 100 حرف' });
    const name = value.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    const normalizedName = name.toLocaleLowerCase('ar-EG');
    const exists = await Region.findOne({ normalizedName }).select('_id name').lean();
    if (exists) return res.status(409).json({ message: 'المنطقة موجودة بالفعل', region: exists });
    const region = await Region.create({ name, createdBy: adminName(req) });
    await writeAdminAudit(req, 'إضافة منطقة خدمة', 'regions', String(region._id), name);
    return res.status(201).json({ message: 'تمت إضافة المنطقة وربطها بقائمة مناطق طلب العميل', region });
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: 'المنطقة موجودة بالفعل' });
    return next(error);
  }
});

router.patch('/regions/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({ name: Joi.string().trim().min(2).max(100).optional(), isActive: Joi.boolean().optional() }).min(1).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'بيانات تعديل المنطقة غير صحيحة' });
    const region = await Region.findById(req.params.id);
    if (!region) return res.status(404).json({ message: 'المنطقة غير موجودة' });
    const before = { name: region.name, isActive: region.isActive };
    if (value.name !== undefined) {
      const name = value.name.normalize('NFC').trim().replace(/\s+/g, ' ');
      const normalizedName = name.toLocaleLowerCase('ar-EG');
      const duplicate = await Region.findOne({ normalizedName, _id: { $ne: region._id } }).select('_id name').lean();
      if (duplicate) return res.status(409).json({ message: 'اسم المنطقة مستخدم بالفعل', region: duplicate });
      region.name = name;
    }
    if (value.isActive !== undefined) region.isActive = value.isActive;
    await region.save();
    await writeAdminAudit(req, 'تعديل منطقة خدمة', 'regions', String(region._id), JSON.stringify({ before, after: { name: region.name, isActive: region.isActive } }));
    return res.json({ message: region.isActive ? 'تم حفظ المنطقة وهي متاحة في نموذج طلب العميل' : 'تم تعطيل المنطقة وإخفاؤها من نموذج طلب العميل', region });
  } catch (error) { return next(error); }
});

router.delete('/regions/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const region = await Region.findById(req.params.id);
    if (!region) return res.status(404).json({ message: 'المنطقة غير موجودة أو حُذفت بالفعل' });
    await Region.deleteOne({ _id: region._id });
    await writeAdminAudit(req, 'حذف منطقة خدمة', 'regions', String(region._id), region.name);
    return res.json({ message: 'تم حذف المنطقة من قائمة الإدارة؛ الطلبات التاريخية محفوظة كما هي' });
  } catch (error) { return next(error); }
});

router.post('/notifications/direct', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      title: Joi.string().trim().min(2).max(100).required(), message: Joi.string().trim().min(2).max(300).required(),
      recipientRole: Joi.string().valid('fanni', 'client').required(), recipientMode: Joi.string().valid('single', 'group').default('single'),
      phone: Joi.string().trim().allow('').optional(),
      audience: Joi.string().valid('all', 'approved', 'active', 'disabled').when('recipientMode', { is: 'group', then: Joi.required(), otherwise: Joi.optional() })
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'بيانات الرسالة أو المستلم غير صحيحة' });
    if (value.recipientMode === 'single') {
      const phone = normalizePhone(value.phone);
      if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'اكتب رقم هاتف مصري صحيحًا للمستلم' });
      let recipient;
      if (value.recipientRole === 'fanni') recipient = await Fanni.findOne({ phone, role: 'fanni' }).select('_id name phone status').lean();
      else recipient = await Client.findOne({ phone }).select('_id name phone status').lean();
      if (!recipient) return res.status(404).json({ message: value.recipientRole === 'fanni' ? 'لا يوجد فني بهذا الرقم' : 'لا يوجد عميل بهذا الرقم' });
      const campaignId = crypto.randomBytes(16).toString('hex');
      await Notification.create({ campaignId, recipientRole: value.recipientRole, recipientId: recipient._id, type: 'admin_message', title: value.title, message: value.message, link: '', readAt: null });
      await writeAdminAudit(req, 'إرسال إشعار فردي', 'notifications', recipient.phone, JSON.stringify({ role: value.recipientRole, campaignId }));
      return res.status(201).json({ message: 'تم إرسال الإشعار إلى المستلم المحدد فقط', sent: 1, campaignId, recipient: { role: value.recipientRole, name: recipient.name, phone: recipient.phone } });
    }
    let filter = {};
    if (value.recipientRole === 'fanni') {
      filter.role = 'fanni';
      if (value.audience === 'approved') filter.status = 'معتمد';
      else if (value.audience === 'disabled') filter.status = 'معلق';
      else if (value.audience === 'active') return res.status(400).json({ message: 'اختار الفنيين المعتمدين أو المعطلين أو الجميع' });
    } else {
      if (value.audience === 'active' || value.audience === 'approved') filter.status = 'نشط';
      else if (value.audience === 'disabled') filter.status = 'معلق';
    }
    const Model = value.recipientRole === 'fanni' ? Fanni : Client;
    const total = await Model.countDocuments(filter);
    if (total > 5000) return res.status(413).json({ message: 'عدد المستلمين أكبر من الحد الآمن (5000). قسّم الإرسال إلى فئات أصغر.', count: total });
    if (!total) return res.status(404).json({ message: 'لا توجد حسابات تطابق الفئة المحددة', sent: 0 });
    const recipients = await Model.find(filter).select('_id').limit(5000).lean();
    const createdAt = new Date();
    const campaignId = crypto.randomBytes(16).toString('hex');
    const docs = recipients.map(person => ({ campaignId, recipientRole: value.recipientRole, recipientId: person._id, type: 'admin_message', title: value.title, message: value.message, link: '', readAt: null, createdAt, updatedAt: createdAt }));
    await Notification.insertMany(docs, { ordered: true });
    await writeAdminAudit(req, 'إرسال إشعار جماعي', 'notifications', value.recipientRole + ':' + value.audience, JSON.stringify({ sent: docs.length, campaignId }));
    return res.status(201).json({ message: 'تم إرسال الإشعار الجماعي داخل التطبيق', sent: docs.length, campaignId, recipientRole: value.recipientRole, audience: value.audience });
  } catch (error) { return next(error); }
});

router.get('/notifications/direct', auth('admin'), async (req, res, next) => {
  try {
    const records = await Notification.find({ type: 'admin_message' }).sort({ createdAt: -1 }).limit(5000).lean();
    const groups = new Map();
    for (const item of records) {
      const legacyKey = !item.campaignId
        ? [item.recipientRole, new Date(item.createdAt || 0).toISOString(), item.title, item.message].join('|')
        : '';
      const key = item.campaignId ? 'campaign:' + item.campaignId : 'legacy:' + legacyKey;
      let group = groups.get(key);
      if (!group) {
        group = { id: String(item._id), campaignId: item.campaignId || null, recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt, count: 0 };
        groups.set(key, group);
      }
      group.count += 1;
    }
    return res.set('Cache-Control', 'no-store').json({ notifications: Array.from(groups.values()).slice(0, 200) });
  } catch (error) { return next(error); }
});

router.delete('/notifications/direct/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const item = await Notification.findOne({ _id: req.params.id, type: 'admin_message' }).lean();
    if (!item) return res.status(404).json({ message: 'الإشعار الإداري غير موجود أو تم حذفه بالفعل' });
    const filter = item.campaignId
      ? { type: 'admin_message', campaignId: item.campaignId, recipientRole: item.recipientRole }
      : { type: 'admin_message', recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt };
    const result = await Notification.deleteMany(filter);
    if (!result.deletedCount) return res.status(404).json({ message: 'الإشعار غير موجود أو تم حذفه بالفعل' });
    await writeAdminAudit(req, 'حذف إشعار إداري', 'notifications', item.campaignId || String(item._id), JSON.stringify({ deleted: result.deletedCount, role: item.recipientRole, title: item.title }));
    return res.json({ message: 'تم حذف الإشعار من جميع الحسابات المستهدفة', deleted: result.deletedCount });
  } catch (error) { return next(error); }
});

router.get('/settings', auth('admin'), async (req, res, next) => {
  try { const config = await getAdminConfig(); return res.set('Cache-Control', 'no-store').json({ settings: config.settings }); }
  catch (err) { next(err); }
});
router.put('/settings', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      siteName: Joi.string().trim().min(2).max(100).required(),
      maintenance: Joi.boolean().required(),
      maintenanceMessage: Joi.string().trim().max(500).allow('').required(),
      maxFanniSignupAttempts: Joi.number().integer().min(1).max(100).required(),
      walletPhone1: Joi.string().trim().max(20).allow('').default(''),
      walletPhone2: Joi.string().trim().max(20).allow('').default('')
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'بيانات الإعدادات غير صحيحة' });
    const config = await getAdminConfig();
    const before = config.settings.toObject ? config.settings.toObject() : { ...config.settings };
    config.settings = value;
    config.history.push({ key: 'settings', before, after: value, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل إعدادات النظام', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حفظ إعدادات النظام', 'settings', 'settings', JSON.stringify({ before, after: value }));
    return res.json({ message: 'تم حفظ الإعدادات. وضع الصيانة مفعل على طلبات العملاء والفنيين؛ حد محاولات تسجيل الفني لكل IP خلال 15 دقيقة مطبق.', settings: config.settings });
  } catch (err) { next(err); }
});
router.delete('/content/faqs/:index', auth('admin'), async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: 'رقم السؤال غير صالح' });
    }
    const config = await getAdminConfig();
    const content = config.content || { announcement: '', faqs: [] };
    const faqs = Array.isArray(content.faqs) ? content.faqs : [];
    if (index >= faqs.length) {
      return res.status(404).json({ message: 'السؤال غير موجود أو تم حذفه بالفعل' });
    }
    const beforeCount = faqs.length;
    const removed = faqs[index];
    faqs.splice(index, 1);
    content.faqs = faqs;
    config.content = content;
    config.history.push({
      key: 'content',
      before: { announcementLength: String(content.announcement || '').length, faqCount: beforeCount },
      after: { announcementLength: String(content.announcement || '').length, faqCount: faqs.length },
      by: adminName(req),
      byId: String(req.user?._id || ''),
      reason: 'حذف سؤال شائع: ' + String(removed.question || '').slice(0, 200),
      createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حذف سؤال شائع', 'content', 'faq', 'تم حذف سؤال من الأسئلة الشائعة');
    return res.json({ message: 'تم حذف السؤال ونشر التغيير لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});
router.get('/content', auth('admin'), async (req, res, next) => {
  try { const config = await getAdminConfig(); return res.json({ content: config.content }); }
  catch (err) { next(err); }
});
router.patch('/content/announcement', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({ announcement: Joi.string().trim().max(1000).allow('').required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'نص الإعلان غير صالح؛ الحد الأقصى 1000 حرف' });
    const config = await getAdminConfig();
    const previousLength = String(config.content?.announcement || '').length;
    const faqCount = Array.isArray(config.content?.faqs) ? config.content.faqs.length : 0;
    // Update only the announcement path so unrelated legacy FAQ records are not revalidated.
    config.set('content.announcement', value.announcement);
    config.history.push({
      key: 'content',
      before: { announcementLength: previousLength, faqCount },
      after: { announcementLength: value.announcement.length, faqCount },
      by: adminName(req), byId: String(req.user?._id || ''),
      reason: value.announcement ? 'تعديل الإعلان فقط' : 'مسح الإعلان',
      createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, value.announcement ? 'تعديل الإعلان' : 'مسح الإعلان', 'content', 'announcement', 'تم تحديث الإعلان دون تغيير الأسئلة الشائعة');
    return res.json({ message: value.announcement ? 'تم حفظ الإعلان ونشره لواجهة العميل.' : 'تم مسح الإعلان ونشر التغيير لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});

router.put('/content', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      announcement: Joi.string().trim().max(1000).allow('').required(),
      faqs: Joi.array().max(100).items(Joi.object({
        question: Joi.string().trim().min(2).max(250).required(),
        answer: Joi.string().trim().min(2).max(1000).required(),
        active: Joi.boolean().default(true)
      }).required()).required()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'نص الإعلان أو الأسئلة الشائعة غير صالح' });
    const config = await getAdminConfig();
    const before = config.content.toObject ? config.content.toObject() : { ...config.content };
    config.content = value;
    config.history.push({ key: 'content', before: { announcementLength: String(before.announcement || '').length, faqCount: Array.isArray(before.faqs) ? before.faqs.length : 0 }, after: { announcementLength: String(value.announcement || '').length, faqCount: value.faqs.length }, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل محتوى الواجهة', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'تعديل محتوى الواجهة', 'content', 'content', 'تم حفظ الإعلان والأسئلة الشائعة');
    return res.json({ message: 'تم حفظ المحتوى ونشره لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});
router.get('/support/search', auth('admin'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.status(400).json({ message: 'اكتب رقم طلب أو هاتفًا أو كود تتبع من حرفين على الأقل' });
    const literal = q.replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/\s+/g, ' ');
    if (literal.length < 2) return res.status(400).json({ message: 'نص البحث غير صالح' });
    const rx = new RegExp(literal, 'i');
    const [orders, complaints] = await Promise.all([
      Order.find({ $or: [{ sn: rx }, { clientPhone: rx }, { clientName: rx }] }).select('sn service status clientName clientPhone area adminActionNote createdAt').sort({ createdAt: -1 }).limit(30).lean(),
      Complaint.find({ $or: [{ sn: rx }, { clientName: rx }, { text: rx }] }).sort({ createdAt: -1 }).limit(30).lean()
    ]);
    return res.json({ orders, complaints });
  } catch (err) { next(err); }
});
router.post('/support/:sn/review', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح؛ استخدم SN متبوعًا بستة أرقام' });
    const complaint = await Complaint.findOne({ sn }).sort({ createdAt: -1 });
    if (complaint) { complaint.status = 'قيد المراجعة'; complaint.reviewedAt = new Date(); complaint.reviewedBy = adminName(req); await complaint.save(); }
    else { const order = await Order.findOne({ sn }); if (!order) return res.status(404).json({ message: 'لا يوجد طلب أو شكوى بهذا الكود' }); order.adminActionNote = 'تم وضع علامة مراجعة من أدوات الدعم'; order.adminActionAt = new Date(); order.adminActionBy = adminName(req); await order.save(); }
    await writeAdminAudit(req, 'وضع علامة مراجعة', 'support', sn, 'مراجعة من أدوات الدعم');
    return res.json({ message: 'تم وضع علامة المراجعة', sn });
  } catch (err) { next(err); }
});
router.get('/support/violations', auth('admin'), async (req, res, next) => {
  try { const logs = await AdminAuditLog.find({ category: 'support' }).sort({ createdAt: -1 }).limit(200).lean(); return res.json({ violations: logs, items: logs }); }
  catch (err) { next(err); }
});
router.patch('/clients/:phone/password', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.params.phone || '').trim());
    if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح.' });
    const schema = Joi.object({ newPassword: Joi.string().min(8).max(128).required(), confirmPassword: Joi.string().required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error || value.newPassword !== value.confirmPassword) return res.status(400).json({ message: 'كلمة السر يجب ألا تقل عن 8 أحرف، والتأكيد يجب أن يطابقها.' });
    const client = await Client.findOne({ phone }).select('+passwordHash');
    if (!client) return res.status(404).json({ message: 'حساب العميل المسجل غير موجود.' });
    client.passwordHash = await bcrypt.hash(value.newPassword, 12);
    await client.save();
    await writeAdminAudit(req, 'تغيير كلمة سر عميل', 'clients', phone, 'تغيير كلمة سر الحساب من لوحة الإدارة دون تسجيل كلمة السر');
    return res.json({ message: 'تم تغيير كلمة سر العميل بنجاح.' });
  } catch (err) { next(err); }
});

router.get('/clients', auth('admin'), async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim().slice(0, 100);
    const literal = q.replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/\s+/g, ' ');
    const rx = literal.length >= 2 ? new RegExp(literal, 'i') : null;
    const registered = await Client.find(rx ? { $or: [{ name: rx }, { phone: rx }] } : {}).select('name phone status adminNote createdAt').sort({ createdAt: -1 }).limit(200).lean();
    const orders = await Order.find(rx ? { $or: [{ clientName: rx }, { clientPhone: rx }, { sn: rx }] } : {}).select('clientName clientPhone sn createdAt').sort({ createdAt: -1 }).limit(500).lean();
    const byPhone = new Map();
    for (const order of orders) { const phone = String(order.clientPhone || ''); if (!phone) continue; const item = byPhone.get(phone) || { name: order.clientName || 'عميل', phone, status: 'غير مسجل', orderCount: 0, lastOrder: '' }; item.orderCount++; if (!item.lastOrder) item.lastOrder = order.sn || ''; byPhone.set(phone, item); }
    for (const client of registered) { const item = byPhone.get(client.phone) || { name: client.name, phone: client.phone, orderCount: 0, lastOrder: '' }; Object.assign(item, { name: client.name, status: client.status, adminNote: client.adminNote || '', registered: true }); byPhone.set(client.phone, item); }
    const clients = Array.from(byPhone.values()).sort((a,b) => (b.orderCount || 0) - (a.orderCount || 0)).slice(0, 200);
    const phones = clients.map(client => normalizePhone(client.phone || '')).filter(Boolean);
    const [ratingStats, completedStats] = phones.length ? await Promise.all([
      Rating.aggregate([
        { $match: { clientPhone: { $in: phones }, reviewerRole: 'fanni' } },
        { $group: { _id: '$clientPhone', average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { clientPhone: { $in: phones }, status: 'تم الانتهاء' } },
        { $group: { _id: '$clientPhone', count: { $sum: 1 } } }
      ])
    ]) : [[], []];
    const ratingsByPhone = new Map(ratingStats.map(item => [normalizePhone(item._id || ''), item]));
    const completedByPhone = new Map(completedStats.map(item => [normalizePhone(item._id || ''), item.count]));
    for (const client of clients) {
      const phone = normalizePhone(client.phone || '');
      const rating = ratingsByPhone.get(phone);
      client.ratingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
      client.ratingCount = rating?.count || 0;
      client.completedJobs = completedByPhone.get(phone) || 0;
    }
    return res.set('Cache-Control', 'no-store').json({ clients, items: clients });
  } catch (err) { next(err); }
});
router.post('/reports', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      startDate: Joi.string().isoDate().allow('').optional(),
      endDate: Joi.string().isoDate().allow('').optional(),
      service: Joi.string().trim().max(100).allow('').optional(),
      area: Joi.string().trim().max(250).allow('').optional()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'فلاتر التقرير غير صحيحة', details: error.details.map(item => item.message) });
    const filter = {};
    if (value.startDate || value.endDate) {
      filter.createdAt = {};
      if (value.startDate) filter.createdAt.$gte = new Date(value.startDate + 'T00:00:00.000Z');
      if (value.endDate) {
        const end = new Date(value.endDate + 'T00:00:00.000Z');
        end.setUTCDate(end.getUTCDate() + 1);
        filter.createdAt.$lt = end;
      }
      if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) {
        return res.status(400).json({ message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له' });
      }
    }
    if (value.service) filter.service = value.service;
    if (value.area) filter.area = value.area;

    const [totalOrders, completedOrders, cancelledOrders, pendingOrders, publishedOrders, topServices, approvedTechnicians, activeClients] = await Promise.all([
      Order.countDocuments(filter),
      Order.countDocuments({ ...filter, status: { $in: ['تم الانتهاء', 'منتهي'] } }),
      Order.countDocuments({ ...filter, status: { $in: ['ملغي', 'منتهي - اعتذار', 'اعتذار'] } }),
      Order.countDocuments({ ...filter, status: 'قيد المراجعة' }),
      Order.countDocuments({ ...filter, status: { $in: ['تم النشر', 'وصلتك عروض'] } }),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 }
      ]),
      Fanni.countDocuments({ role: 'fanni', status: 'معتمد' }),
      Client.countDocuments({ status: 'نشط' })
    ]);
    return res.set('Cache-Control', 'no-store').json({
      message: 'تم إنشاء التقرير من بيانات قاعدة البيانات',
      generatedAt: new Date(),
      filters: { startDate: value.startDate || '', endDate: value.endDate || '', service: value.service || '', area: value.area || '' },
      summary: { totalOrders, completedOrders, cancelledOrders, pendingOrders, publishedOrders, approvedTechnicians, activeClients },
      topServices: topServices.map(item => ({ service: item._id || 'غير محدد', count: item.count }))
    });
  } catch (error) { return next(error); }
});



// ===================== إدارة الخدمات - مصحح نهائي متوافق مع public.js و Service.js =====================
function normalizeForCompare(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ريسيفر/g, 'رسيفر');
}

function normalizeBrokenWallScreenServiceName(value) {
  return normalizeForCompare(value)
    .replace(/^[^ء-ي]+/, '')
    .replace(/ة/g, 'ه');
}

const BROKEN_WALL_SCREEN_SERVICE_NAMES = [
  normalizeBrokenWallScreenServiceName('تعليق شاشة حائط'),
  normalizeBrokenWallScreenServiceName('تركيب شاشة حائط')
];

function isBrokenWallScreenService(value) {
  return BROKEN_WALL_SCREEN_SERVICE_NAMES.includes(normalizeBrokenWallScreenServiceName(value));
}

function parseBooleanStrict(value) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 'true' || value === 'false') {
    return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي true/false وليس نص "' + value + '"' };
  }
  if (typeof value === 'string') {
    const low = value.trim().toLowerCase();
    if (low === 'true' || low === 'false') {
      return { ok: false, reason: 'قيمة isActive يجب أن تكون Boolean حقيقي وليس نص' };
    }
  }
  return { ok: false, reason: 'قيمة isActive يجب أن تكون true أو false فقط' };
}

function validateNameField(name) {
  if (typeof name !== 'string') return 'اسم الخدمة يجب أن يكون نص';
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم الخدمة لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم الخدمة طويل جداً (الحد 100 حرف)';
  return null;
}

function validateCategoryField(cat) {
  if (typeof cat !== 'string') return 'اسم القسم يجب أن يكون نص';
  const t = cat.trim().replace(/\s+/g, ' ');
  if (t.length < 1) return 'اسم القسم لا يمكن أن يكون فارغاً';
  if (t.length > 100) return 'اسم القسم طويل جداً';
  return null;
}

function validateSortOrder(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100000) {
    return 'sortOrder يجب أن يكون رقم صحيح بين 0 و 100000';
  }
  return null;
}

function buildAdminCategoriesMap(savedServices) {
  const map = new Map();
  // Legacy services are seeded below, so an inactive database tombstone must
  // suppress the seed itself; merely skipping the DB row leaves the old item visible.
  const hiddenLegacyKeys = new Set(savedServices
    .filter(saved => saved.isActive === false)
    .filter(saved => CATEGORIES.some(cat =>
      normalizeForCompare(cat.label) === normalizeForCompare(saved.category) &&
      cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
    ))
    .map(saved => normalizeForCompare(saved.category) + '|' + normalizeForCompare(saved.name)));
  for (const [categoryIndex, cat] of CATEGORIES.entries()) {
    const key = normalizeForCompare(cat.label);
    map.set(key, {
      label: cat.label,
      emoji: cat.emoji,
      categorySortOrder: (categoryIndex + 1) * 10,
      services: cat.services.map((name, index) => ({
        name,
        normalizedName: normalizeForCompare(name),
        emoji: cat.emoji,
        isActive: true,
        source: 'legacy',
        category: cat.label,
        dbId: null,
        sortOrder: (index + 1) * 10
      })).filter(service => !hiddenLegacyKeys.has(key + '|' + service.normalizedName))
    });
  }
  for (const saved of savedServices) {
    const catKey = normalizeForCompare(saved.category);
    const isInactiveLegacyTombstone = saved.isActive === false && CATEGORIES.some(cat =>
      normalizeForCompare(cat.label) === catKey &&
      cat.services.some(name => normalizeForCompare(name) === normalizeForCompare(saved.name))
    );
    if (isInactiveLegacyTombstone) continue;
    if (!map.has(catKey)) {
      map.set(catKey, {
        label: saved.category,
        emoji: saved.emoji || '🔧',
        categorySortOrder: Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0 ? Number(saved.categorySortOrder) : 100000,
        services: []
      });
    }
    const category = map.get(catKey);
    if (Number.isFinite(Number(saved.categorySortOrder)) && Number(saved.categorySortOrder) > 0) category.categorySortOrder = Number(saved.categorySortOrder);
    const serviceKey = normalizeForCompare(saved.name);
    const existingIdx = category.services.findIndex(s => normalizeForCompare(s.name) === serviceKey);
    const dbItem = {
      name: saved.name,
      normalizedName: normalizeForCompare(saved.name),
      emoji: saved.emoji || category.emoji || '🔧',
      isActive: saved.isActive,
      source: 'database',
      category: saved.category,
      isCustom: !(findCategoryByService(saved.name) && normalizeForCompare(findCategoryByService(saved.name).label) === normalizeForCompare(saved.category)),
      dbId: String(saved._id),
      sortOrder: Number.isFinite(Number(saved.sortOrder)) ? Number(saved.sortOrder) : 0,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
    if (existingIdx !== -1) {
      category.services.splice(existingIdx, 1, dbItem);
    } else {
      category.services.push(dbItem);
    }
  }
  for (const category of map.values()) category.services.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar'));
  return new Map(Array.from(map.entries()).sort((a, b) => a[1].categorySortOrder - b[1].categorySortOrder || a[1].label.localeCompare(b[1].label, 'ar')));
}

async function findServicesByName(rawName) {
  const norm = normalizeForCompare(rawName);
  if (!norm) return [];
  // الموديل الجديد فيه normalizedName - نستخدمه مباشرة للأداء
  const found = await Service.find({ normalizedName: norm }).lean();
  if (found.length > 0) return found;
  // fallback للتوافق: لو normalizedName مش موجود (بيانات قديمة) نفلتر يدوياً
  const all = await Service.find({}).lean();
  return all.filter(s => normalizeForCompare(s.name) === norm);
}

async function ensureHiddenLegacy(oldName, oldCategoryLabel) {
  const normOld = normalizeForCompare(oldName);
  if (!normOld) throw new Error('اسم الخدمة القديم غير صالح للإخفاء');
  const existing = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
  if (existing) {
    if (existing.isActive) {
      existing.isActive = false;
      await existing.save();
    }
    return existing;
  }
  const legacyCat = findCategoryByService(oldName) || findCategoryByLabel(oldCategoryLabel);
  const emoji = legacyCat ? legacyCat.emoji : '🔧';
  try {
    const hidden = await Service.create({
      name: oldName,
      category: oldCategoryLabel,
      emoji,
      isActive: false,
      sortOrder: 9999
    });
    return hidden;
  } catch (e) {
    if (e.code === 11000) {
      const dup = await Service.findOne({ normalizedName: normOld, category: oldCategoryLabel });
      if (dup) {
        if (dup.isActive) {
          dup.isActive = false;
          await dup.save();
        }
        return dup;
      }
      throw e;
    }
    throw e;
  }
}

router.get('/services', auth('admin'), async (req, res, next) => {
  try {
    const savedServices = await Service.find({}).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
    const visibleServices = savedServices.filter(item => !isBrokenWallScreenService(item.name));
    const map = buildAdminCategoriesMap(visibleServices);
    const categoriesDetailed = Array.from(map.values()).map(cat => ({
      label: cat.label,
      name: cat.label,
      emoji: cat.emoji,
      categorySortOrder: cat.categorySortOrder,
      services: cat.services.map(s => s.name),
      _displayServices: cat.services.map(s => s.name),
      _detailed: cat.services,
      count: cat.services.length,
      activeCount: cat.services.filter(s => s.isActive).length
    }));
    const allFlat = [];
    for (const cat of map.values()) {
      for (const s of cat.services) allFlat.push(s);
    }
    return res.json({
      ok: true,
      categories: categoriesDetailed,
      services: allFlat,
      data: categoriesDetailed,
      legacyCategories: CATEGORIES
    });
  } catch (e) { next(e); }
});

router.post('/services', auth('admin'), async (req, res, next) => {
  try {
    let { name, category, emoji, sortOrder } = req.body;

    const nameErr = validateNameField(name || '');
    if (nameErr) return res.status(400).json({ message: nameErr });
    name = String(name).trim().replace(/\s+/g, ' ');
    if (isBrokenWallScreenService(name)) return res.status(400).json({ message: 'الخدمة دي محذوفة نهائيًا ولا يمكن إضافتها مرة أخرى' });

    if (!category || !String(category).trim()) {
      const found = findCategoryByService(name);
      category = found ? found.label : 'خدمات أخرى';
    }
    const catErr = validateCategoryField(category);
    if (catErr) return res.status(400).json({ message: catErr });
    category = String(category).trim().replace(/\s+/g, ' ');

    const sortErr = validateSortOrder(sortOrder);
    if (sortErr) return res.status(400).json({ message: sortErr });

    if (emoji !== undefined && emoji !== null && emoji !== '') {
      if (typeof emoji !== 'string' || emoji.trim().length > 10) {
        return res.status(400).json({ message: 'الرمز التعبيري غير صالح' });
      }
    }

    const payload = {
      name,
      category,
      emoji: emoji ? String(emoji).trim() : (findCategoryByLabel(category)?.emoji || findCategoryByService(name)?.emoji || '🔧'),
      sortOrder: sortOrder !== undefined && sortOrder !== '' ? Number(sortOrder) : 0,
      categorySortOrder: (findCategoryByLabel(category) ? (CATEGORIES.findIndex(c => normalizeForCompare(c.label) === normalizeForCompare(category)) + 1) * 10 : 100000),
      isActive: true
    };

    const existingInCategory = (await Service.find({ category }).select('+normalizedName')).find(item =>
      normalizeForCompare(item.name) === normalizeForCompare(name)
    );
    if (existingInCategory) {
      if (existingInCategory.isActive) return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
      existingInCategory.name = name;
      existingInCategory.category = category;
      existingInCategory.emoji = payload.emoji;
      existingInCategory.sortOrder = payload.sortOrder;
      existingInCategory.categorySortOrder = payload.categorySortOrder;
      existingInCategory.isActive = true;
      await existingInCategory.save();
      return res.json({ ok: true, message: 'تمت إعادة إضافة الخدمة', service: existingInCategory, data: existingInCategory });
    }
    const service = await Service.create(payload);
    
    return res.status(201).json({ ok: true, message: 'تمت إضافة الخدمة', service, data: service });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
    }
    next(err);
  }
});


router.patch('/services/categories/order', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({ categories: Joi.array().min(1).max(200).items(Joi.string().trim().min(1).max(100)).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'قائمة ترتيب الأقسام غير صحيحة' });
    const seen = new Set(), labels = value.categories.map(label => label.replace(/\s+/g, ' '));
    for (const label of labels) { const key = normalizeForCompare(label); if (seen.has(key)) return res.status(400).json({ message: 'يوجد قسم مكرر في الترتيب' }); seen.add(key); const err = validateCategoryField(label); if (err) return res.status(400).json({ message: err }); }
    for (const [index, category] of labels.entries()) {
      const categoryOrder = (index + 1) * 10, legacy = findCategoryByLabel(category);
      if (legacy) for (const [serviceIndex, name] of legacy.services.entries()) {
        let service = await Service.findOne({ normalizedName: normalizeForCompare(name), category });
        if (!service) await Service.create({ name, category, emoji: legacy.emoji || '🔧', isActive: true, sortOrder: (serviceIndex + 1) * 10, categorySortOrder: categoryOrder });
        else { service.categorySortOrder = categoryOrder; await service.save(); }
      }
      await Service.updateMany({ category }, { $set: { categorySortOrder: categoryOrder } });
    }
    await writeAdminAudit(req, 'تغيير ترتيب الأقسام الأساسية', 'services', 'categories', JSON.stringify({ count: labels.length }));
    return res.json({ ok: true, message: 'تم حفظ ترتيب الأقسام', count: labels.length });
  } catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'تعذر حفظ ترتيب الأقسام بسبب خدمة مكررة' }); next(err); }
});

router.patch('/services/order', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({ category: Joi.string().trim().min(1).max(100).required(), items: Joi.array().min(1).max(500).items(Joi.object({
      name: Joi.string().trim().min(1).max(100).required(), sortOrder: Joi.number().integer().min(0).max(100000).required(),
      emoji: Joi.string().max(20).allow('').optional(), isActive: Joi.boolean().optional()
    }).required()).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'بيانات ترتيب الخدمات غير صحيحة' });
    const category = value.category.replace(/\s+/g, ' ');
    const categoryError = validateCategoryField(category);
    if (categoryError) return res.status(400).json({ message: categoryError });
    const seen = new Set();
    for (const item of value.items) { const key = normalizeForCompare(item.name); if (seen.has(key)) return res.status(400).json({ message: 'يوجد تكرار في قائمة ترتيب الخدمات' }); seen.add(key); }
    for (const item of value.items) {
      const normalizedName = normalizeForCompare(item.name);
      let service = await Service.findOne({ normalizedName, category });
      if (service) {
        service.sortOrder = item.sortOrder; if (item.emoji) service.emoji = item.emoji;
        if (item.isActive !== undefined) service.isActive = item.isActive;
        await service.save();
      } else {
        const legacyCategory = findCategoryByLabel(category), legacyService = findCategoryByService(item.name);
        await Service.create({ name: item.name, category, emoji: item.emoji || legacyService?.emoji || legacyCategory?.emoji || '🔧', isActive: item.isActive !== false, sortOrder: item.sortOrder });
      }
    }
    await writeAdminAudit(req, 'تغيير ترتيب الخدمات', 'services', category, JSON.stringify({ count: value.items.length }));
    return res.json({ ok: true, message: 'تم حفظ ترتيب الخدمات', count: value.items.length });
  } catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'تعذر حفظ الترتيب بسبب خدمة مكررة في القسم' }); next(err); }
});

router.delete('/services/:id', auth('admin'), async (req, res, next) => {
  try {
    const rawId = String(req.params.id || '').trim(), requestedCategory = req.query.category ? String(req.query.category).trim().replace(/\s+/g, ' ') : '';
    // Treat both historical labels as the same broken service; old UI rows may
    // carry either name and stale IDs/categories.
    let requestedService = null;
    if (mongoose.isValidObjectId(rawId)) requestedService = await Service.findById(rawId).select('name').lean();
    if (isBrokenWallScreenService(rawId) || isBrokenWallScreenService(requestedService?.name)) {
      const allRows = await Service.find({}).select('_id name').lean();
      const matchingIds = allRows.filter(item => isBrokenWallScreenService(item.name)).map(item => item._id);
      if (matchingIds.length) await Service.deleteMany({ _id: { $in: matchingIds } });
      const remainingRows = await Service.find({}).select('name').lean();
      if (remainingRows.some(item => isBrokenWallScreenService(item.name))) {
        return res.status(409).json({ message: 'تعذر تأكيد حذف كل نسخ الخدمة. لم يتم الإبلاغ عن نجاح الحذف.' });
      }
      await writeAdminAudit(req, 'حذف نهائي لخدمة معطلة', 'services', 'تركيب شاشة حائط', JSON.stringify({ category: requestedCategory, removedCopies: matchingIds.length, historicalOrdersPreserved: true }));
      return res.json({ ok: true, deleted: true, message: 'تم حذف الخدمة المعطلة من كل الأقسام. الطلبات القديمة محفوظة.' });
    }
    let service = null;
    if (mongoose.isValidObjectId(rawId)) service = await Service.findById(rawId);
    else {
      const candidates = await findServicesByName(rawId), matches = requestedCategory ? candidates.filter(item => normalizeForCompare(item.category) === normalizeForCompare(requestedCategory)) : candidates;
      if (matches.length > 1) return res.status(409).json({ message: 'الخدمة موجودة في أكثر من قسم؛ حدّد القسم قبل الحذف', duplicates: matches.map(item => ({ name: item.name, category: item.category })) });
      service = matches[0] || null;
      if (!service && requestedCategory) { const legacy = findCategoryByLabel(requestedCategory), legacyName = legacy?.services.find(name => normalizeForCompare(name) === normalizeForCompare(rawId)); if (legacyName) service = await ensureHiddenLegacy(legacyName, legacy.label); }
    }
    if (!service) return res.status(404).json({ message: 'الخدمة غير موجودة في القسم المحدد' });
    const name = service.name, category = service.category;
    const normalizedName = normalizeForCompare(name);
    if (isBrokenWallScreenService(normalizedName)) {
      const allRows = await Service.find({}).select('_id name').lean();
      const matchingIds = allRows.filter(item => isBrokenWallScreenService(item.name)).map(item => item._id);
      if (matchingIds.length) await Service.deleteMany({ _id: { $in: matchingIds } });
      const remainingRows = await Service.find({}).select('name').lean();
      if (remainingRows.some(item => isBrokenWallScreenService(item.name))) {
        return res.status(409).json({ message: 'لم نتمكن من إزالة كل نسخ الخدمة؛ لم يتم تأكيد الحذف' });
      }
      await writeAdminAudit(req, 'حذف نهائي لخدمة معطلة', 'services', name, JSON.stringify({ category, removedCopies: matchingIds.length, historicalOrdersPreserved: true }));
      return res.json({ ok: true, deleted: true, message: 'تم حذف الخدمة المعطلة نهائيًا من كل الأقسام. الطلبات السابقة محفوظة.' });
    }
    if (requestedCategory && normalizeForCompare(category) !== normalizeForCompare(requestedCategory)) {
      return res.status(404).json({ message: 'الخدمة لا تنتمي إلى القسم المحدد؛ لم يتم حذف أي سجل' });
    }
    const isLegacyService = CATEGORIES.some(cat =>
      cat.services.some(item => normalizeForCompare(item) === normalizedName) &&
      normalizeForCompare(cat.label) === normalizeForCompare(category)
    );
    let deleted = false;
    if (isLegacyService) {
      // Some older built-in services exist in more than one legacy category.
      // Hide every matching legacy entry so it cannot reappear from another category,
      // while leaving historical orders untouched.
      const legacyCategories = CATEGORIES.filter(cat =>
        cat.services.some(item => normalizeForCompare(item) === normalizedName)
      );
      const allRows = await Service.find({}).select('_id name category isActive');
      for (const legacyCat of legacyCategories) {
        const legacyRows = allRows.filter(item =>
          normalizeForCompare(item.name) === normalizedName &&
          normalizeForCompare(item.category) === normalizeForCompare(legacyCat.label)
        );
        for (const row of legacyRows) {
          if (row.isActive) { row.isActive = false; await row.save(); }
        }
        if (!legacyRows.length) await ensureHiddenLegacy(name, legacyCat.label);
      }
      deleted = true;
    } else {
      const sameCategoryRows = await Service.find({ category }).select('_id name');
      const duplicateIds = sameCategoryRows.filter(item => normalizeForCompare(item.name) === normalizedName).map(item => item._id);
      if (!duplicateIds.length) return res.status(409).json({ message: 'لم يتم العثور على سجل الخدمة لحذفه؛ حدّث القائمة وحاول مرة أخرى' });
      const result = await Service.deleteMany({ _id: { $in: duplicateIds } });
      if (result.deletedCount !== duplicateIds.length) return res.status(409).json({ message: 'لم يتم حذف كل سجلات الخدمة المكررة؛ راجع القائمة وحاول مرة أخرى' });
      const remaining = await Service.find({ category }).select('name').lean();
      if (remaining.some(item => normalizeForCompare(item.name) === normalizedName)) return res.status(409).json({ message: 'ما زالت هناك نسخة من الخدمة في القسم؛ لم نؤكد اكتمال الحذف' });
      deleted = true;
    }
    await writeAdminAudit(req, 'حذف نهائي لخدمة', 'services', name, JSON.stringify({ category, deleted: true, legacyTombstone: isLegacyService }));
    return res.json({
      ok: true,
      deleted,
      message: 'تم حذف الخدمة من قائمة الخدمات. الطلبات السابقة محفوظة.'
    });
  } catch (err) { next(err); }
});

router.patch('/services/:name', auth('admin'), async (req, res, next) => {
  let createdNewService = null;
  let oldNameForRollback = null;
  let oldCategoryForRollback = null;
  try {
    const rawParam = String(req.params.name || '').trim();
    if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة الأصلي مطلوب' });

    const { name: newNameRaw, category: newCategoryRaw, emoji, sortOrder, isActive } = req.body;
    const queryCategory = req.query.category ? String(req.query.category).trim() : null;

    if (newNameRaw !== undefined) {
      const err = validateNameField(newNameRaw);
      if (err) return res.status(400).json({ message: err });
    }
    if (newCategoryRaw !== undefined) {
      const err = validateCategoryField(newCategoryRaw);
      if (err) return res.status(400).json({ message: err });
    }
    if (sortOrder !== undefined) {
      const err = validateSortOrder(sortOrder);
      if (err) return res.status(400).json({ message: err });
    }
    if (emoji !== undefined && emoji !== null && emoji !== '') {
      if (typeof emoji !== 'string' || emoji.trim().length > 10) {
        return res.status(400).json({ message: 'الرمز التعبيري غير صالح' });
      }
    }
    if (isActive !== undefined) {
      const parsed = parseBooleanStrict(isActive);
      if (!parsed.ok) return res.status(400).json({ message: parsed.reason });
    }

    let candidates = [];
    if (mongoose.isValidObjectId(rawParam)) {
      const byId = await Service.findById(rawParam);
      if (byId) candidates = [byId];
    } else {
      candidates = await findServicesByName(rawParam);
    }

    if (candidates.length === 0) {
      const legacyCat = findCategoryByService(rawParam);
      if (!legacyCat) {
        return res.status(404).json({ message: 'الخدمة غير موجودة في قاعدة البيانات ولا في القائمة الأساسية' });
      }
      if (!newNameRaw || !String(newNameRaw).trim()) {
        return res.status(400).json({ message: 'خدمات القائمة الأساسية لا يمكن تعديلها مباشرة بدون اسم جديد. أضف خدمة جديدة ثم أخفِ القديمة عبر /hide' });
      }
      const newName = String(newNameRaw).trim().replace(/\s+/g, ' ');
      const targetCategory = newCategoryRaw ? String(newCategoryRaw).trim() : (queryCategory || legacyCat.label);

      try {
        createdNewService = await Service.create({
          name: newName,
          category: targetCategory,
          emoji: emoji ? String(emoji).trim() : (findCategoryByLabel(targetCategory)?.emoji || legacyCat.emoji),
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
          isActive: true
        });
        oldNameForRollback = rawParam;
        oldCategoryForRollback = legacyCat.label;
        await ensureHiddenLegacy(rawParam, legacyCat.label);
        return res.json({ ok: true, message: 'تم إنشاء الخدمة الجديدة وإخفاء القديمة الأساسية حتى لا تظهر مرة أخرى', service: createdNewService });
      } catch (e) {
        if (createdNewService) {
          try { await Service.deleteOne({ _id: createdNewService._id }); } catch {}
        }
        if (e.code === 11000) return res.status(409).json({ message: 'الاسم الجديد موجود بالفعل في نفس القسم' });
        throw e;
      }
    }

    if (candidates.length > 1) {
      const filterCat = queryCategory || (newCategoryRaw ? String(newCategoryRaw).trim() : null);
      if (!filterCat) {
        return res.status(409).json({
          message: 'اسم الخدمة موجود في أكثر من قسم، يجب تحديد القسم',
          duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive })),
          hint: 'أرسل ?category=اسم_القسم في الرابط أو category في body'
        });
      }
      const normFilter = normalizeForCompare(filterCat);
      const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
      if (matched.length === 0) {
        return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد', duplicates: candidates.map(c => ({ name: c.name, category: c.category })) });
      }
      if (matched.length > 1) {
        return res.status(409).json({ message: 'يوجد أكثر من خدمة بنفس الاسم في نفس القسم المحدد - راجع البيانات', duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category })) });
      }
      candidates = matched;
    }

    const serviceDoc = await Service.findById(candidates[0]._id);
    if (!serviceDoc) return res.status(404).json({ message: 'الخدمة غير موجودة' });

    const oldName = serviceDoc.name;
    const oldCategory = serviceDoc.category;
    const oldNormalized = serviceDoc.normalizedName;

    let willRename = false;
    let newNameForHideCheck = null;

    if (newNameRaw !== undefined) {
      const nn = String(newNameRaw).trim().replace(/\s+/g, ' ');
      if (normalizeForCompare(nn) !== normalizeForCompare(oldName)) {
        willRename = true;
        newNameForHideCheck = nn;
        serviceDoc.name = nn;
      }
    }
    if (newCategoryRaw !== undefined) {
      serviceDoc.category = String(newCategoryRaw).trim().replace(/\s+/g, ' ');
    }
    if (emoji !== undefined) serviceDoc.emoji = String(emoji).trim() || serviceDoc.emoji || '🔧';
    if (sortOrder !== undefined) serviceDoc.sortOrder = Number(sortOrder);
    if (isActive !== undefined) {
      serviceDoc.isActive = isActive;
    }

    try {
      await serviceDoc.save();
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'الاسم الجديد مكرر في نفس القسم' });
      throw e;
    }

    if (willRename) {
      const oldLegacy = findCategoryByService(oldName);
      if (oldLegacy) {
        try {
          await ensureHiddenLegacy(oldName, oldLegacy.label);
        } catch (hideErr) {
          try {
            serviceDoc.name = oldName;
            serviceDoc.category = oldCategory;
            await serviceDoc.save();
          } catch (rollbackErr) {
            return res.status(500).json({
              message: 'تم تغيير الاسم لكن فشل إخفاء الاسم القديم وفشل التراجع. يجب مراجعة البيانات يدوياً',
              error: hideErr.message,
              rollbackError: rollbackErr.message,
              service: serviceDoc
            });
          }
          return res.status(500).json({
            message: 'فشل إخفاء الاسم القديم، تم التراجع عن تغيير الاسم. حاول مرة أخرى',
            error: hideErr.message
          });
        }
      }
    }

    return res.json({ ok: true, message: 'تم تعديل الخدمة', service: serviceDoc, data: serviceDoc });
  } catch (err) {
    if (createdNewService && oldNameForRollback) {
      try { await Service.deleteOne({ _id: createdNewService._id }); } catch {}
    }
    next(err);
  }
});

router.post('/services/:name/hide', auth('admin'), async (req, res, next) => {
  try {
    const rawParam = String(req.params.name || '').trim();
    if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة مطلوب' });
    const queryCategory = req.query.category ? String(req.query.category).trim() : null;
    const bodyCategory = req.body && req.body.category ? String(req.body.category).trim() : null;
    const filterCategory = queryCategory || bodyCategory;

    if (filterCategory) {
      const err = validateCategoryField(filterCategory);
      if (err) return res.status(400).json({ message: err });
    }

    let candidates = [];
    if (mongoose.isValidObjectId(rawParam)) {
      const byId = await Service.findById(rawParam);
      if (byId) candidates = [byId];
    } else {
      candidates = await findServicesByName(rawParam);
    }

    if (candidates.length > 1 && !filterCategory) {
      return res.status(409).json({
        message: 'اسم الخدمة موجود في أكثر من قسم، حدد القسم لإخفاء الخدمة الصحيحة',
        duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
      });
    }

    let target = null;
    if (candidates.length === 1) {
      target = await Service.findById(candidates[0]._id);
    } else if (candidates.length > 1 && filterCategory) {
      const normFilter = normalizeForCompare(filterCategory);
      const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
      if (matched.length === 0) return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد' });
      if (matched.length > 1) return res.status(409).json({ message: 'يوجد تكرار في نفس القسم، لا يمكن تحديد الخدمة', duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category })) });
      target = await Service.findById(matched[0]._id);
    }

    if (target) {
      target.isActive = false;
      await target.save();
      return res.json({ ok: true, message: 'تم إخفاء الخدمة - لن تظهر للعملاء بسبب الدمج في public.js', service: target });
    }

    const legacyCat = findCategoryByService(rawParam);
    if (legacyCat) {
      const hidden = await ensureHiddenLegacy(rawParam, legacyCat.label);
      return res.json({ ok: true, message: 'تم إخفاء الخدمة الأساسية - لن تظهر مرة أخرى في قائمة العميل لأن public.js يتحقق من isActive=false', service: hidden });
    }

    return res.status(404).json({ message: 'الخدمة غير موجودة في القائمة الأساسية أو قاعدة البيانات' });
  } catch (e) { next(e); }
});

router.post('/services/:name/show', auth('admin'), async (req, res, next) => {
  try {
    const rawParam = String(req.params.name || '').trim();
    if (!rawParam) return res.status(400).json({ message: 'اسم الخدمة مطلوب' });
    const queryCategory = req.query.category ? String(req.query.category).trim() : null;
    const bodyCategory = req.body && req.body.category ? String(req.body.category).trim() : null;
    const filterCategory = queryCategory || bodyCategory;

    if (filterCategory) {
      const err = validateCategoryField(filterCategory);
      if (err) return res.status(400).json({ message: err });
    }

    let candidates = [];
    if (mongoose.isValidObjectId(rawParam)) {
      const byId = await Service.findById(rawParam);
      if (byId) candidates = [byId];
    } else {
      candidates = await findServicesByName(rawParam);
    }

    if (candidates.length === 0) {
      return res.status(404).json({ message: 'الخدمة غير موجودة - لا يمكن إظهار خدمة لم يتم إخفاؤها مسبقاً' });
    }

    if (candidates.length > 1 && !filterCategory) {
      return res.status(409).json({
        message: 'اسم الخدمة موجود في أكثر من قسم، حدد القسم لإظهاره بدقة',
        duplicates: candidates.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
      });
    }

    let target = null;
    if (candidates.length === 1) {
      target = await Service.findById(candidates[0]._id);
    } else if (candidates.length > 1 && filterCategory) {
      const normFilter = normalizeForCompare(filterCategory);
      const matched = candidates.filter(c => normalizeForCompare(c.category) === normFilter);
      if (matched.length === 0) return res.status(404).json({ message: 'لم يتم العثور على الخدمة في القسم المحدد' });
      if (matched.length > 1) {
        return res.status(409).json({
          message: 'يوجد أكثر من سجل لنفس الخدمة في نفس القسم - يجب تنظيف البيانات يدوياً',
          duplicates: matched.map(c => ({ id: String(c._id), name: c.name, category: c.category, isActive: c.isActive }))
        });
      }
      target = await Service.findById(matched[0]._id);
    }

    if (!target) return res.status(404).json({ message: 'الخدمة غير موجودة' });

    target.isActive = true;
    await target.save();
    return res.json({ ok: true, message: 'تمت إعادة تفعيل الخدمة', service: target });
  } catch (e) { next(e); }
});




router.get('/page-visits', auth('admin'), async (req,res,next)=>{try{const parsedLimit=Number.parseInt(req.query.limit,10),limit=Number.isInteger(parsedLimit)&&parsedLimit>0?Math.min(parsedLimit,200):100,pageKey=String(req.query.pageKey||'').trim().slice(0,80),match=pageKey?{pageKey}:{};const [summary,recent,total]=await Promise.all([PageVisit.aggregate([{$match:match},{$group:{_id:{pageKey:'$pageKey',pageName:'$pageName'},visits:{$sum:1},lastVisit:{$max:'$visitedAt'}}},{$sort:{visits:-1,lastVisit:-1}},{$limit:100}]),PageVisit.find(match).sort({visitedAt:-1}).limit(limit).select('pageKey pageName path referrer visitedAt').lean(),PageVisit.countDocuments(match)]);return res.set('Cache-Control','no-store').json({summary:summary.map(item=>({pageKey:item._id.pageKey,pageName:item._id.pageName,visits:item.visits,lastVisit:item.lastVisit})),recent,total});}catch(err){next(err);}});

module.exports = router;
