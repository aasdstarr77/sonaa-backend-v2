'use strict';

const express = require('express');
const mongoose = require('mongoose');
const SupportCase = require('../models/SupportCase');
const { auth } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');

const router = express.Router();
const CASE_STATUSES = ['جديدة', 'بانتظار الدعم', 'قيد المعالجة', 'بانتظار رد المستخدم', 'تم الحل', 'مغلقة'];

function cleanText(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function publicCase(item) {
  const data = item.toObject ? item.toObject() : item;
  return {
    _id: data._id, ownerRole: data.ownerRole, ownerName: data.ownerName,
    subject: data.subject, status: data.status, needsHuman: data.needsHuman,
    messages: data.messages, lastMessageAt: data.lastMessageAt,
    createdAt: data.createdAt, updatedAt: data.updatedAt
  };
}
function ownerFilter(role, id) {
  return { ownerRole: role, ownerId: id };
}
async function createCase(req, res, role) {
  const owner = role === 'client' ? req.client : req.user;
  const text = cleanText(req.body?.text);
  const subject = cleanText(req.body?.subject, 120) || 'استفسار عام';
  if (text.length < 1) return res.status(400).json({ message: 'اكتب رسالتك أولًا.' });
  const item = await SupportCase.create({
    ...ownerFilter(role, owner._id),
    ownerName: cleanText(owner.name, 100),
    subject,
    status: 'بانتظار الدعم',
    needsHuman: true,
    messages: [{ senderRole: role, senderId: String(owner._id), text }]
  });
  return res.status(201).json({ message: 'تم فتح محادثة الدعم.', supportCase: publicCase(item) });
}
async function listCases(req, res, role) {
  const owner = role === 'client' ? req.client : req.user;
  const items = await SupportCase.find(ownerFilter(role, owner._id)).sort({ lastMessageAt: -1 }).limit(50).lean();
  return res.json({ supportCases: items });
}
async function getOwnedCase(req, res, role) {
  const owner = role === 'client' ? req.client : req.user;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف محادثة الدعم غير صحيح.' });
  const item = await SupportCase.findOne({ _id: req.params.id, ...ownerFilter(role, owner._id) });
  if (!item) return res.status(404).json({ message: 'محادثة الدعم غير موجودة.' });
  return item;
}
async function sendOwnerMessage(req, res, role) {
  const item = await getOwnedCase(req, res, role);
  if (!item) return;
  const text = cleanText(req.body?.text);
  if (!text) return res.status(400).json({ message: 'اكتب الرسالة أولًا.' });
  if (['تم الحل', 'مغلقة'].includes(item.status)) {
    return res.status(409).json({ message: 'تم إغلاق الحالة. افتح محادثة دعم جديدة لو المشكلة مستمرة.' });
  }
  item.messages.push({ senderRole: role, senderId: String((role === 'client' ? req.client : req.user)._id), text });
  item.status = 'بانتظار الدعم';
  // Any new owner message after an admin reply needs another human review.
  item.needsHuman = role === 'client' || role === 'fanni' || req.body?.needsHuman === true;
  await item.save();
  return res.json({ message: 'تم إرسال الرسالة.', supportCase: publicCase(item) });
}

router.post('/client', clientAuth, async (req, res, next) => {
  try { return await createCase(req, res, 'client'); } catch (e) { return next(e); }
});
router.get('/client', clientAuth, async (req, res, next) => {
  try { return await listCases(req, res, 'client'); } catch (e) { return next(e); }
});
router.get('/client/:id', clientAuth, async (req, res, next) => {
  try { const item = await getOwnedCase(req, res, 'client'); return item ? res.json({ supportCase: publicCase(item) }) : undefined; } catch (e) { return next(e); }
});
router.post('/client/:id/messages', clientAuth, async (req, res, next) => {
  try { return await sendOwnerMessage(req, res, 'client'); } catch (e) { return next(e); }
});

router.post('/fanni', auth('fanni'), async (req, res, next) => {
  try { return await createCase(req, res, 'fanni'); } catch (e) { return next(e); }
});
router.get('/fanni', auth('fanni'), async (req, res, next) => {
  try { return await listCases(req, res, 'fanni'); } catch (e) { return next(e); }
});
router.get('/fanni/:id', auth('fanni'), async (req, res, next) => {
  try { const item = await getOwnedCase(req, res, 'fanni'); return item ? res.json({ supportCase: publicCase(item) }) : undefined; } catch (e) { return next(e); }
});
router.post('/fanni/:id/messages', auth('fanni'), async (req, res, next) => {
  try { return await sendOwnerMessage(req, res, 'fanni'); } catch (e) { return next(e); }
});

router.get('/admin', auth('admin'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query?.needsHuman === 'true') filter.needsHuman = true;
    if (req.query?.status && CASE_STATUSES.includes(String(req.query.status))) filter.status = String(req.query.status);
    const items = await SupportCase.find(filter).sort({ needsHuman: -1, lastMessageAt: -1 }).limit(200).lean();
    return res.json({ supportCases: items });
  } catch (e) { return next(e); }
});
router.get('/admin/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف محادثة الدعم غير صحيح.' });
    const item = await SupportCase.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'محادثة الدعم غير موجودة.' });
    return res.json({ supportCase: publicCase(item) });
  } catch (e) { return next(e); }
});
router.post('/admin/:id/reply', auth('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف محادثة الدعم غير صحيح.' });
    const text = cleanText(req.body?.text);
    if (!text) return res.status(400).json({ message: 'اكتب الرد أولًا.' });
    const item = await SupportCase.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'محادثة الدعم غير موجودة.' });
    if (['تم الحل', 'مغلقة'].includes(item.status)) return res.status(409).json({ message: 'الحالة مغلقة؛ أعد فتحها قبل الرد.' });
    item.messages.push({ senderRole: 'admin', senderId: String(req.user._id), text });
    item.status = 'بانتظار رد المستخدم';
    item.needsHuman = false;
    await item.save();
    return res.json({ message: 'تم إرسال رد الدعم.', supportCase: publicCase(item) });
  } catch (e) { return next(e); }
});
router.patch('/admin/:id/status', auth('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف محادثة الدعم غير صحيح.' });
    const status = cleanText(req.body?.status, 40);
    if (!CASE_STATUSES.includes(status)) return res.status(400).json({ message: 'حالة الدعم غير صحيحة.' });
    const item = await SupportCase.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'محادثة الدعم غير موجودة.' });
    item.status = status;
    item.needsHuman = ['جديدة', 'بانتظار الدعم', 'قيد المعالجة'].includes(status);
    await item.save();
    return res.json({ message: 'تم تحديث حالة الدعم.', supportCase: publicCase(item) });
  } catch (e) { return next(e); }
});

module.exports = router;
