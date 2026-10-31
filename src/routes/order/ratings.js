'use strict';

const express = require('express');

function createOrderRatingRouter({
  Joi,
  Order,
  validSN,
  verifyClientToken,
  jwt,
  Fanni,
  Rating,
  normalizePhone,
  sanitizeText,
  autoPromoteFanni,
  createNotification
}) {
  const router = express.Router();

router.post('/:sn/rating', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) {
      return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    }

    const schema = Joi.object({
      stars: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().trim().max(500).allow('').default(''),
      blockFuture: Joi.boolean().default(false),
      clientToken: Joi.string().allow('').optional()
    }).unknown(false);
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: 'اختار تقييمًا من نجمة إلى 5 نجوم، والتعليق اختياري بحد أقصى 500 حرف' });
    }
    if (value.blockFuture && value.stars !== 1) {
      return res.status(400).json({ message: 'إيقاف التعامل متاح فقط مع تقييم نجمة واحدة' });
    }

    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.status !== 'تم الانتهاء' || !order.assignedFanni) {
      return res.status(409).json({ message: 'التقييم متاح بعد إكمال المهمة فعليًا فقط' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : String(value.clientToken || '');
    let reviewerRole = '';
    let reviewerId = null;

    if (await verifyClientToken({ ...req, body: { ...(req.body || {}), clientToken: token }, headers: {} }, order)) {
      reviewerRole = 'client';
    } else {
      if (!token || !process.env.JWT_SECRET) {
        return res.status(401).json({ message: 'تعذر التحقق من ملكية الطلب أو حساب الفني' });
      }
      let payload;
      try { payload = jwt.verify(token, process.env.JWT_SECRET); }
      catch { return res.status(401).json({ message: 'جلسة غير صالحة أو منتهية' }); }
      if (!payload.id) {
        return res.status(403).json({ message: 'هذه الجلسة لا تسمح بتقييم المهمة' });
      }
      const fanni = await Fanni.findById(payload.id).select('_id role status name');
      if (!fanni || fanni.role !== 'fanni' || fanni.status !== 'معتمد' ||
          String(fanni._id) !== String(order.assignedFanni)) {
        return res.status(403).json({ message: 'التقييم متاح للفني المعيّن على هذه المهمة فقط' });
      }
      reviewerRole = 'fanni';
      reviewerId = fanni._id;
    }

    const existingRating = await Rating.exists({ orderId: order._id, reviewerRole });
    if (existingRating) {
      return res.status(409).json({ message: 'سبق أن قيّمت هذه المهمة' });
    }

    const rating = await Rating.create({
      orderId: order._id,
      orderSn: order.sn,
      clientPhone: normalizePhone(order.clientPhone),
      fanniId: order.assignedFanni,
      reviewerRole,
      reviewerId,
      stars: value.stars,
      comment: sanitizeText(value.comment || ''),
      blockFuture: Boolean(value.blockFuture)
    });

    if (reviewerRole === 'client') {
      const aggregate = await Rating.aggregate([
        { $match: { fanniId: order.assignedFanni, reviewerRole: 'client' } },
        { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]);
      const stats = aggregate[0] || { average: 0, count: 0 };
      await Fanni.updateOne(
        { _id: order.assignedFanni },
        { $set: { 'rating.average': Math.round(stats.average * 100) / 100, 'rating.count': stats.count } }
      );
      await autoPromoteFanni(order.assignedFanni, 'تحديث تقييمات العملاء');
    }

    await createNotification({
      recipientRole: reviewerRole === 'client' ? 'fanni' : 'client',
      recipientId: reviewerRole === 'client' ? order.assignedFanni : order.clientAccount,
      type: 'order_rated',
      title: reviewerRole === 'client' ? 'وصلك تقييم جديد' : 'قيّمك الفني',
      message: (reviewerRole === 'client' ? 'قيّمك العميل' : 'قيّمك الفني') + ' في الطلب ' + order.sn + ' (' + value.stars + '/5 نجوم).',
      link: reviewerRole === 'client' ? '/fanni' : '/?tab=orders',
      dedupeKey: 'order-rating:' + String(order._id) + ':' + reviewerRole
    });

    return res.status(201).json({
      message: 'تم حفظ تقييمك بنجاح، وأصبح ظاهرًا للطرفين',
      rating: {
        reviewerRole: rating.reviewerRole,
        stars: rating.stars,
        comment: rating.comment,
        blockFuture: rating.blockFuture,
        createdAt: rating.createdAt
      }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'سبق أن قيّمت هذه المهمة' });
    }
    next(err);
  }
});


  return router;
}

module.exports = createOrderRatingRouter;
