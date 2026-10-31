'use strict';

const express = require('express');

function createAdminClientsRouter({
  auth,
  Joi,
  Client,
  normalizePhone,
  adminName,
  writeAdminAudit
}) {
  const router = express.Router();

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

  return router;
}

module.exports = createAdminClientsRouter;
