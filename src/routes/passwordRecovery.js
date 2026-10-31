'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const Client = require('../models/Client');
const Fanni = require('../models/Fanni');
const PasswordRecovery = require('../models/PasswordRecovery');
const { auth, isRootAdmin, canAccessAdmin } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');
const { notifyAdmins } = require('../utils/notifications');

const router = express.Router();
const adminSelfAuth = (req, res, next) => auth()(req, res, () => {
  if (req.user.role !== 'admin' && !req.user.adminRole) return res.status(403).json({ message: 'هذا الإجراء مخصص لحسابات الإدارة.' });
  return next();
});
const supportAdminAuth = (req, res, next) => auth()(req, res, () => {
  if (req.user.role !== 'admin' && !req.user.adminRole) return res.status(403).json({ message: 'هذا الإجراء مخصص لحسابات الإدارة.' });
  const scopedReq = { ...req, path: '/password-recovery/admin/requests', method: req.method };
  if (!isRootAdmin(req.user) && !canAccessAdmin(req.user, scopedReq)) return res.status(403).json({ message: 'ليست لديك صلاحية إدارة طلبات استعادة الحساب.' });
  return next();
});
const passwordSchema = Joi.string().min(8).max(128).required();
const codeSchema = Joi.string().pattern(/^\d{6}$/).required();
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const SECRET_MESSAGE_PREFIX = '__SONAA_RECOVERY_SECRET_V1__:';
function encryptRecoveryMessage(text) {
  const key = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '') + '|sonaa-recovery-chat-v1').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return SECRET_MESSAGE_PREFIX + [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
function decryptRecoveryMessage(text) {
  if (typeof text !== 'string' || !text.startsWith(SECRET_MESSAGE_PREFIX)) return text;
  try {
    const parts = text.slice(SECRET_MESSAGE_PREFIX.length).split(':');
    if (parts.length !== 3) return 'رسالة رمز استعادة محمية.';
    const key = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '') + '|sonaa-recovery-chat-v1').digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
  } catch (_) { return 'رسالة رمز استعادة محمية.'; }
}
function protectRecoveryMessage(text, item) {
  return item.codeHash && item.codeExpiresAt > new Date() && !item.codeUsedAt && /\d{6}/.test(text)
    ? encryptRecoveryMessage(text) : text;
}
const randomToken = () => crypto.randomBytes(32).toString('hex');
function encryptAccessToken(token) {
  const key = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '') + '|sonaa-recovery-access-v1').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
function decryptAccessToken(value) {
  try {
    const parts = String(value || '').split(':');
    if (parts.length !== 3) return '';
    const key = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '') + '|sonaa-recovery-access-v1').digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
  } catch (_) { return ''; }
}
const clean = (v, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const sameDigest = (a, b) => {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};
function safeRequest(item, includeMessages = true) {
  const data = item.toObject ? item.toObject() : item;
  return {
    id: String(data._id), ownerRole: data.ownerRole, accountName: data.accountName,
    phone: data.phone, subject: data.subject, status: data.status,
    verifiedAt: data.verifiedAt, messages: includeMessages ? (data.messages || []).map(message => ({ id: String(message._id || message.id || ''), senderRole: message.senderRole, senderId: message.senderId ? String(message.senderId) : undefined, text: decryptRecoveryMessage(message.text), createdAt: message.createdAt || null })) : [],
    lastMessageAt: data.lastMessageAt, expiresAt: data.expiresAt,
    createdAt: data.createdAt, updatedAt: data.updatedAt
  };
}
async function lookupAccount(role, phone) {
  if (role === 'client') {
    const user = await Client.findOne({ phone }).select('+passwordHash');
    return user ? { user, role } : null;
  }
  const user = await Fanni.findOne({
    phone,
    $or: [{ role: 'fanni' }, { role: 'admin' }, { adminRole: { $in: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'] } }]
  }).select('+passwordHash');
  if (!user) return null;
  const canRecoverAsAdmin = user.role === 'admin' || Boolean(user.adminRole);
  if (role === 'admin') return canRecoverAsAdmin ? { user, role: 'admin' } : null;
  return user.role === 'fanni' ? { user, role: 'fanni' } : null;
}
function safeUserRecovery(item) { const data = safeRequest(item); return { id: data.id, status: data.status, messages: (data.messages || []).map(message => ({ ...message, text: decryptRecoveryMessage(message.text) })), lastMessageAt: data.lastMessageAt, expiresAt: data.expiresAt }; }
function ownerAuth(req, res, next) {
  const role = req.params.role;
  if (role === 'client') return clientAuth(req, res, next);
  if (role === 'fanni') return auth('fanni')(req, res, next);
  return res.status(400).json({ message: 'نوع الحساب غير صحيح.' });
}

// Password change: every role can change only its own password after proving the current one.
router.post('/change/client', clientAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, await Client.findById(req.client._id).select('+passwordHash').then(x => x?.passwordHash || '')))) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    }
    const valid = passwordSchema.validate(newPassword);
    if (valid.error || newPassword !== confirmPassword || newPassword === currentPassword) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل، والتأكيد مطابقًا، وألا تكون هي القديمة.' });
    const user = await Client.findById(req.client._id).select('+passwordHash');
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    const token = jwt.sign({ id: String(user._id), role: 'client', tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '7d', issuer: 'sonaa-backend-v2', audience: 'sonaa-client' });
    return res.json({ message: 'تم تغيير كلمة المرور بنجاح.', token });
  } catch (e) { return next(e); }
});
router.post('/change/fanni', auth('fanni'), async (req, res, next) => {
  try {
    const user = await Fanni.findById(req.user._id).select('+passwordHash');
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!user || typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash || ''))) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    const valid = passwordSchema.validate(newPassword);
    if (valid.error || newPassword !== confirmPassword || newPassword === currentPassword) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل، والتأكيد مطابقًا، وألا تكون هي القديمة.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    const token = jwt.sign({ id: String(user._id), role: 'fanni', tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return res.json({ message: 'تم تغيير كلمة المرور بنجاح.', token });
  } catch (e) { return next(e); }
});
router.post('/change/admin', adminSelfAuth, async (req, res, next) => {
  try {
    const user = await Fanni.findById(req.user._id).select('+passwordHash');
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!user || typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash || ''))) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    const valid = passwordSchema.validate(newPassword);
    if (valid.error || newPassword !== confirmPassword || newPassword === currentPassword) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل، والتأكيد مطابقًا، وألا تكون هي القديمة.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    const token = jwt.sign({ id: String(user._id), role: user.role, adminRole: user.adminRole || null, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1d' });
    return res.json({ message: 'تم تغيير كلمة المرور بنجاح.', token });
  } catch (e) { return next(e); }
});

// Recovery requests are anonymous, but only registered accounts may open a support conversation.
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Invalid numbers and role mismatches are validation failures, not recovery attempts.
  // Do not lock users out because they selected the wrong account type.
  skipFailedRequests: true,
  message: { message: 'تم تجاوز عدد طلبات الاستعادة الصحيحة. حاول مرة أخرى بعد قليل.' }
});
router.post('/request', recoveryLimiter, async (req, res, next) => {
  try {
    const role = clean(req.body?.role, 20);
    const phone = clean(req.body?.phone, 30).replace(/\D/g, '');
    if (!['client', 'fanni', 'admin'].includes(role) || !/^01\d{9}$/.test(phone)) return res.status(400).json({ message: 'اكتب نوع الحساب ورقم هاتف صحيحًا.' });

    const [registeredClient, registeredFanni] = await Promise.all([
      Client.findOne({ phone }).select('_id name').lean(),
      Fanni.findOne({ phone }).select('_id name role adminRole').lean()
    ]);
    if (!registeredClient && !registeredFanni) {
      return res.status(404).json({ message: 'هذا الرقم غير مسجل في صُنّاع.' });
    }

    const account = await lookupAccount(role, phone);
    if (!account) {
      if (role === 'client' && registeredFanni) {
        return res.status(400).json({ message: 'الرقم مسجل كفني، اختر نوع الحساب الصحيح لاستعادة كلمة السر.' });
      }
      if (role === 'fanni' && registeredClient) {
        return res.status(400).json({ message: 'الرقم مسجل كعميل، اختر نوع الحساب الصحيح لاستعادة كلمة السر.' });
      }
      return res.status(400).json({ message: 'الرقم مسجل، لكنه لا يطابق نوع الحساب المحدد.' });
    }

    const existing = await PasswordRecovery.findOne({
      ownerRole: role, phone, accountId: account.user._id,
      status: { $nin: ['تمت الاستعادة', 'مرفوضة', 'منتهية'] },
      expiresAt: { $gt: new Date() }
    }).select('+accessTokenHash +accessTokenEncrypted').sort({ lastMessageAt: -1 });
    if (existing) {
      const existingToken = decryptAccessToken(existing.accessTokenEncrypted);
      if (!existingToken) {
        return res.status(409).json({ message: 'عندك بالفعل طلب استعادة مفتوح. افتح طلبك السابق من نفس الجهاز لمتابعة رد الدعم، ولا تنشئ طلبًا جديدًا.' });
      }
      return res.status(200).json({
        message: 'أنت قدمت طلب استعادة بالفعل. تم فتح طلبك السابق لمتابعة رد الدعم.',
        recoveryToken: existingToken, requestId: String(existing._id), existing: true
      });
    }

    const token = randomToken();
    const item = await PasswordRecovery.create({
      ownerRole: role, accountId: account.user._id, accountName: account.user.name || '',
      phone, accessTokenHash: digest(token), accessTokenEncrypted: encryptAccessToken(token), status: 'بانتظار الدعم',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      messages: [{ senderRole: 'user', text: 'طلب استعادة كلمة المرور. يرجى التحقق من ملكية الحساب قبل إصدار رمز الاستعادة.' }]
    });
    await notifyAdmins({ type: 'admin_password_recovery', title: 'طلب تغيير/استعادة كلمة مرور', message: `وصل طلب استعادة كلمة مرور لحساب ${role} برقم ${phone}.`, link: '/admin?tab=support', dedupeKey: 'admin-password-recovery:' + String(item._id) });
    return res.status(201).json({ message: 'تم فتح طلب استعادة كلمة السر. احتفظ برمز متابعة الطلب.', recoveryToken: token, requestId: String(item._id) });
  } catch (e) { return next(e); }
});
async function findByTicket(req, res) {
  const token = String(req.headers['x-recovery-token'] || req.body?.recoveryToken || req.query?.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) { res.status(401).json({ message: 'رمز متابعة الطلب غير صحيح.' }); return null; }
  if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) { res.status(400).json({ message: 'معرّف طلب الاستعادة غير صحيح.' }); return null; }
  const item = await PasswordRecovery.findOne({ _id: req.params.id, accessTokenHash: digest(token), expiresAt: { $gt: new Date() } }).select('+codeHash');
  if (!item) { res.status(404).json({ message: 'طلب الاستعادة غير موجود أو انتهت صلاحيته.' }); return null; }
  return item;
}
router.get('/request/:id', async (req, res, next) => {
  try {
    const item = await findByTicket(req, res);
    if (!item) return;
    return res.json({ recovery: { id: String(item._id), status: item.status, messages: safeRequest(item).messages, lastMessageAt: item.lastMessageAt, expiresAt: item.expiresAt } });
  } catch (e) { return next(e); }
});
router.post('/request/:id/messages', async (req, res, next) => {
  try {
    const item = await findByTicket(req, res);
    if (!item) return;
    if (['تمت الاستعادة', 'مرفوضة', 'منتهية'].includes(item.status)) return res.status(409).json({ message: 'لا يمكن متابعة هذا الطلب. تواصل مع الدعم أو ابدأ طلبًا جديدًا.' });
    const text = clean(req.body?.text);
    if (!text) return res.status(400).json({ message: 'اكتب رسالتك أولًا.' });
    item.messages.push({ senderRole: 'user', text });
    if (item.status === 'بانتظار رد المستخدم') item.status = 'قيد التحقق';
    await item.save();
    return res.json({ message: 'تم إرسال رسالتك للدعم.', recovery: safeUserRecovery(item) });
  } catch (e) { return next(e); }
});
router.post('/request/:id/verify-code', async (req, res, next) => {
  try {
    const item = await findByTicket(req, res);
    if (!item) return;
    if (!item.accountId || item.status !== 'تم التحقق' || !item.codeHash || item.codeUsedAt || !item.codeExpiresAt || item.codeExpiresAt <= new Date()) return res.status(400).json({ message: 'لا يوجد رمز صالح لهذا الطلب.' });
    if (item.codeAttempts >= 5) return res.status(429).json({ message: 'تم تجاوز عدد المحاولات. اطلب من الدعم إصدار رمز جديد.' });
    const code = String(req.body?.code || '');
    if (!codeSchema.validate(code).error && sameDigest(item.codeHash, digest(code))) {
      item.codeUsedAt = new Date();
      item.status = 'تم التحقق';
      await item.save();
      return res.json({ message: 'تم التحقق من الرمز. يمكنك تعيين كلمة مرور جديدة.' });
    }
    item.codeAttempts += 1;
    await item.save();
    return res.status(400).json({ message: 'رمز التحقق غير صحيح.' });
  } catch (e) { return next(e); }
});
router.post('/request/:id/reset-password', async (req, res, next) => {
  try {
    const item = await findByTicket(req, res);
    if (!item) return;
    if (!item.accountId || item.status !== 'تم التحقق' || !item.codeUsedAt) return res.status(403).json({ message: 'أكمل التحقق من الرمز أولًا.' });
    if (item.expiresAt <= new Date()) return res.status(410).json({ message: 'انتهت صلاحية طلب الاستعادة.' });
    const { newPassword, confirmPassword } = req.body || {};
    if (passwordSchema.validate(newPassword).error || newPassword !== confirmPassword) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل والتأكيد مطابقًا.' });
    let account;
    if (item.ownerRole === 'client') account = await Client.findById(item.accountId).select('+passwordHash');
    else account = await Fanni.findById(item.accountId).select('+passwordHash');
    if (!account) return res.status(404).json({ message: 'الحساب غير موجود.' });
    account.passwordHash = await bcrypt.hash(newPassword, 12);
    account.tokenVersion = Number(account.tokenVersion || 0) + 1;
    await account.save();
    item.status = 'تمت الاستعادة';
    item.accessTokenHash = digest(randomToken());
    item.codeHash = '';
    item.codeExpiresAt = null;
    item.codeUsedAt = null;
    item.messages.push({ senderRole: 'admin', text: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول بكلمة المرور الجديدة.' });
    await item.save();
    return res.json({ message: 'تم تغيير كلمة المرور بنجاح. سجّل الدخول من جديد.' });
  } catch (e) { return next(e); }
});

// Admin/support queue. The operator must verify identity through the conversation before issuing a code.
router.get('/admin/requests', supportAdminAuth, async (req, res, next) => {
  try {
    const items = await PasswordRecovery.find({ accountId: { $ne: null }, status: { $nin: ['تمت الاستعادة', 'مرفوضة', 'منتهية'] }, expiresAt: { $gt: new Date() } })
      .sort({ lastMessageAt: -1 }).limit(200).select('+codeHash').lean();
    return res.json({ recoveries: items.map(x => ({ id: String(x._id), ownerRole: x.ownerRole, accountName: x.accountName, phone: x.phone, status: x.status, lastMessageAt: x.lastMessageAt, createdAt: x.createdAt })) });
  } catch (e) { return next(e); }
});
router.get('/admin/requests/:id', supportAdminAuth, async (req, res, next) => {
  try {
    const item = await PasswordRecovery.findOne({ _id: req.params.id, accountId: { $ne: null }, expiresAt: { $gt: new Date() } });
    if (!item) return res.status(404).json({ message: 'طلب الاستعادة غير موجود.' });
    return res.json({ recovery: safeRequest(item) });
  } catch (e) { return next(e); }
});
router.delete('/admin/requests/:id/messages/:messageId', supportAdminAuth, async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || '')) || !/^[a-f0-9]{24}$/i.test(String(req.params.messageId || ''))) {
      return res.status(400).json({ message: 'معرّف الطلب أو الرسالة غير صحيح.' });
    }
    const item = await PasswordRecovery.findOne({
      _id: req.params.id,
      accountId: { $ne: null },
      expiresAt: { $gt: new Date() }
    });
    if (!item) return res.status(404).json({ message: 'طلب الاستعادة غير موجود.' });
    const message = item.messages.id(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'الرسالة غير موجودة أو تم حذفها بالفعل.' });
    message.deleteOne();
    item.lastMessageAt = item.messages.length
      ? (item.messages[item.messages.length - 1].createdAt || new Date())
      : item.createdAt;
    await item.save();
    return res.json({ message: 'تم حذف الرسالة من محادثة استعادة كلمة المرور.', recovery: safeRequest(item) });
  } catch (e) { return next(e); }
});
router.post('/admin/requests/:id/reply', supportAdminAuth, async (req, res, next) => {
  try {
    const text = clean(req.body?.text);
    if (!text) return res.status(400).json({ message: 'اكتب الرد أولًا.' });
    const item = await PasswordRecovery.findOne({ _id: req.params.id, accountId: { $ne: null }, expiresAt: { $gt: new Date() } }).select('+codeHash');
    if (!item) return res.status(404).json({ message: 'طلب الاستعادة غير موجود.' });
    if (['تمت الاستعادة', 'مرفوضة', 'منتهية'].includes(item.status)) return res.status(409).json({ message: 'طلب الاستعادة مغلق.' });
    item.messages.push({ senderRole: 'admin', senderId: String(req.user._id), text: protectRecoveryMessage(text, item) });
    item.status = item.codeHash && item.codeExpiresAt > new Date() && !item.codeUsedAt ? 'تم التحقق' : 'بانتظار رد المستخدم';
    await item.save();
    return res.json({ message: 'تم إرسال الرد.', recovery: safeRequest(item) });
  } catch (e) { return next(e); }
});
router.post('/admin/requests/:id/issue-code', supportAdminAuth, async (req, res, next) => {
  try {
    const item = await PasswordRecovery.findOne({ _id: req.params.id, accountId: { $ne: null }, expiresAt: { $gt: new Date() } }).select('+codeHash');
    if (!item) return res.status(404).json({ message: 'طلب الاستعادة غير موجود.' });
    if (['تمت الاستعادة', 'مرفوضة', 'منتهية'].includes(item.status)) return res.status(409).json({ message: 'طلب الاستعادة مغلق.' });
    if (item.codeHash && item.codeExpiresAt > new Date() && !item.codeUsedAt) return res.status(409).json({ message: 'يوجد رمز صالح بالفعل. انتظر انتهاء صلاحيته قبل إصدار رمز جديد.' });
    const code = String(crypto.randomInt(100000, 1000000));
    item.codeHash = digest(code);
    item.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    item.codeAttempts = 0;
    item.codeUsedAt = null;
    item.verifiedAt = new Date();
    item.verifiedBy = String(req.user._id);
    item.status = 'تم التحقق';
    item.messages.push({ senderRole: 'admin', senderId: String(req.user._id), text: 'تم التحقق من ملكية الحساب. سيصلك رمز استعادة مؤقت داخل هذه المحادثة. صالح لمدة 10 دقائق.' });
    await item.save();
    // Returned once to the verified support operator; it is never stored in plaintext.
    return res.json({ message: 'تم إصدار الرمز بعد تأكيد التحقق. أرسل الرمز للمستخدم من نفس المحادثة.', code, expiresInSeconds: 600, recovery: safeRequest(item) });
  } catch (e) { return next(e); }
});
router.post('/admin/requests/:id/reject', supportAdminAuth, async (req, res, next) => {
  try {
    const reason = clean(req.body?.reason, 500) || 'تعذر التحقق من ملكية الحساب.';
    const item = await PasswordRecovery.findOne({ _id: req.params.id, accountId: { $ne: null }, expiresAt: { $gt: new Date() } });
    if (!item) return res.status(404).json({ message: 'طلب الاستعادة غير موجود.' });
    item.status = 'مرفوضة';
    item.messages.push({ senderRole: 'admin', senderId: String(req.user._id), text: reason });
    item.codeHash = '';
    item.codeExpiresAt = null;
    await item.save();
    return res.json({ message: 'تم رفض الطلب.', recovery: safeRequest(item) });
  } catch (e) { return next(e); }
});

module.exports = router;
