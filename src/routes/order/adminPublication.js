'use strict';

const express = require('express');

function createOrderAdminPublicationRouter({
  auth,
  validSN,
  Order,
  writeOrderAdminAudit,
  ORDER_EXPIRY_HOURS,
  Fanni,
  fanniCanHandleService,
  createNotification,
  publicOrder
}) {
  const router = express.Router();

  router.post('/admin/:sn/voice-reviewed', auth('admin'), async (req, res, next) => {
    try {
      const sn = String(req.params.sn || '').toUpperCase();
      if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
      const order = await Order.findOne({ sn }).select('+voiceRecordingData status voiceReviewedAt').exec();
      if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
      if (!order.voiceRecordingData) return res.status(409).json({ message: 'الطلب لا يحتوي على تسجيل صوتي.' });
      if (order.status !== 'قيد المراجعة') return res.status(409).json({ message: 'لا يمكن تغيير مراجعة التسجيل بعد خروج الطلب من المراجعة.' });
      order.voiceReviewedAt = new Date();
      order.voiceReviewedBy = String(req.userId || req.user?._id || req.user?.email || 'admin').slice(0, 120);
      await order.save();
      await writeOrderAdminAudit(req, 'تأكيد مراجعة تسجيل صوتي', sn, 'تم تأكيد مراجعة التسجيل الصوتي للطلب قبل النشر');
      return res.json({ message: 'تم تسجيل مراجعة الفويس. يمكنك الآن نشر الطلب بعد مراجعة باقي البيانات.', voiceReviewedAt: order.voiceReviewedAt });
    } catch (err) { return next(err); }
  });
  
  router.post('/admin/:sn/publish', auth('admin'), async (req, res, next) => {
    try {
      // auth('admin') enforces the dedicated publishOrders permission for this route.
      const sn = String(req.params.sn || '').toUpperCase();
  
      if (!validSN(sn)) {
        return res.status(400).json({
          message: 'كود الطلب غير صحيح'
        });
      }
  
      const reviewCheck = await Order.findOne({ sn }).select('+voiceRecordingData status voiceReviewedAt').lean();
      if (!reviewCheck) return res.status(404).json({ message: 'الطلب غير موجود' });
      if (reviewCheck.status !== 'قيد المراجعة') return res.status(409).json({ message: 'الطلب ليس قيد المراجعة، لذلك لم يتم نشره', status: reviewCheck.status });
      if (reviewCheck.voiceRecordingData && !reviewCheck.voiceReviewedAt) return res.status(409).json({ message: 'لا يمكن نشر الطلب قبل الاستماع إلى التسجيل الصوتي وتأكيد مراجعته من الإدارة.' });
      const order = await Order.findOneAndUpdate(
        { sn, status: 'قيد المراجعة', $or: [{ voiceRecordingData: { $exists: false } }, { voiceRecordingData: '' }, { voiceReviewedAt: { $type: 'date' } }] },
        {
          $set: {
            status: 'تم النشر',
            expiresAt: new Date(
              Date.now() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000
            )
          }
        },
        { new: true, runValidators: true }
      );
  
      if (!order) {
        const existing = await Order.findOne({ sn }).select('status').lean();
  
        if (!existing) {
          return res.status(404).json({
            message: 'الطلب غير موجود'
          });
        }
  
        if (existing.status === 'قيد المراجعة') {
          const stillHasVoice = await Order.findOne({ sn }).select('+voiceRecordingData voiceReviewedAt').lean();
          if (stillHasVoice?.voiceRecordingData && !stillHasVoice.voiceReviewedAt) return res.status(409).json({ message: 'لا يمكن نشر الطلب قبل الاستماع إلى التسجيل الصوتي وتأكيد مراجعته من الإدارة.' });
        }
        return res.status(409).json({ message: 'الطلب ليس قيد المراجعة، لذلك لم يتم نشره', status: existing.status });
      }
  
      // Notify every approved technician whose specialties match; work area is informational only.
      const eligibleFannis = await Fanni.find({ role: 'fanni', status: 'معتمد' }).select('_id specialties').lean();
      for (const fanni of eligibleFannis) {
        if (fanniCanHandleService(fanni.specialties, order.service)) {
          await createNotification({
            recipientRole: 'fanni', recipientId: fanni._id, type: 'new_opportunity',
            title: 'فرصة عمل جديدة', message: 'طلب جديد يناسب تخصصك في ' + order.area + ' (' + order.service + ').',
            link: '/fanni', dedupeKey: 'new-opportunity:' + String(order._id) + ':' + String(fanni._id)
          });
        }
      }
  
      const safeOrder = publicOrder(order);
      await writeOrderAdminAudit(req, 'نشر طلب للفنيين', sn, JSON.stringify({ service: order.service, area: order.area, approvedTechniciansScanned: eligibleFannis.length }));
  
      return res.json({
        message: 'تم نشر الطلب للفنيين المعتمدين بنجاح',
        order: safeOrder,
        data: safeOrder
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createOrderAdminPublicationRouter;
