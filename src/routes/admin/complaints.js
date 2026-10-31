'use strict';

const express = require('express');

function createAdminComplaintsRouter({
  auth,
  validate,
  Joi,
  complaintStatusSchema,
  MAX_LIST_LIMIT,
  validId,
  sendBadId,
  Complaint,
  Order,
  adminName,
  writeAdminAudit,
  createNotification
}) {
  const router = express.Router();

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

  return router;
}

module.exports = createAdminComplaintsRouter;
