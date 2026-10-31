'use strict';

const express = require('express');

function createOrderAvailableRouter({
  auth,
  Order,
  ACTIVE_STATUSES,
  Fanni,
  Rating,
  normalizePhone,
  fanniCanHandleService,
  publicOrder
}) {
  const router = express.Router();

router.get('/available', auth(), async (req, res, next) => {
  try {
    let specialties = [];

    if (req.user.role !== 'admin') {
      if (
        req.user.role !== 'fanni' ||
        req.user.status !== 'معتمد'
      ) {
        return res.status(403).json({
          message: 'حساب الفني لم يتم اعتماده بعد'
        });
      }

      const fanni = await Fanni.findOne({
        _id: req.userId,
        role: 'fanni',
        status: 'معتمد'
      }).select('specialties technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();
      if (!fanni?.technicianGuidelinesAcceptedAt || !fanni?.technicianGuidelinesVersion) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

      if (!fanni) {
        return res.status(403).json({
          message: 'حساب الفني غير موجود أو غير معتمد'
        });
      }

      specialties = Array.isArray(fanni.specialties)
        ? fanni.specialties
        : [];

      if (specialties.length === 0) {
        return res.json({ orders: [], data: [] });
      }
    }

    const orders = await Order.find({
      status: { $in: ACTIVE_STATUSES },
      expiresAt: { $gt: new Date() }
    })
      .select('-phone -address -clientName +voiceRecordingData')
      .sort({ createdAt: -1 })
      .lean();

    let matchingOrders = orders;

    if (req.user.role !== 'admin') {
      matchingOrders = orders.filter(order =>
        fanniCanHandleService(specialties, order.service)
      );
    }

    if (req.user.role === 'fanni') {
      const blockedRatings = await Rating.find({
        fanniId: req.userId,
        blockFuture: true
      }).select('clientPhone').lean();
      const blockedPhones = new Set(
        blockedRatings.map(item => normalizePhone(item.clientPhone)).filter(Boolean)
      );
      matchingOrders = matchingOrders.filter(order =>
        !blockedPhones.has(normalizePhone(order.clientPhone))
      );
      // Also hide this technician from customers who blocked them.
      const clientBlocks = await Rating.find({
        reviewerRole: 'client',
        fanniId: req.userId,
        blockFuture: true
      }).select('clientPhone').lean();
      const clientBlockedPhones = new Set(
        clientBlocks.map(item => normalizePhone(item.clientPhone)).filter(Boolean)
      );
      matchingOrders = matchingOrders.filter(order =>
        !clientBlockedPhones.has(normalizePhone(order.clientPhone))
      );
    }

    let clientRatingsByPhone = new Map();
    let clientCompletedByPhone = new Map();
    if (req.user.role === 'fanni' && matchingOrders.length) {
      const phones = [...new Set(matchingOrders.map(order => normalizePhone(order.clientPhone || '')).filter(Boolean))];
      if (phones.length) {
        const [ratingStats, completedStats] = await Promise.all([
          Rating.aggregate([
            { $match: { clientPhone: { $in: phones }, reviewerRole: 'fanni' } },
            { $group: { _id: '$clientPhone', average: { $avg: '$stars' }, count: { $sum: 1 } } }
          ]),
          Order.aggregate([
            { $match: { clientPhone: { $in: phones }, status: 'تم الانتهاء' } },
            { $group: { _id: '$clientPhone', count: { $sum: 1 } } }
          ])
        ]);
        clientRatingsByPhone = new Map(ratingStats.map(item => [normalizePhone(item._id || ''), item]));
        clientCompletedByPhone = new Map(completedStats.map(item => [normalizePhone(item._id || ''), item.count]));
      }
    }
    const safeOrders = matchingOrders.map(order => {
      const safeOrder = publicOrder(order, {
        includeAddress: false,
        includeClientName: false
      });
      if (req.user.role === 'fanni') {
        const phone = normalizePhone(order.clientPhone || '');
        const rating = clientRatingsByPhone.get(phone);
        safeOrder.clientRatingAverage = rating ? Math.round(Number(rating.average || 0) * 100) / 100 : 0;
        safeOrder.clientRatingCount = rating?.count || 0;
        safeOrder.clientCompletedJobs = clientCompletedByPhone.get(phone) || 0;
      }
      return safeOrder;
    });

    return res.json({
      orders: safeOrders,
      data: safeOrders
    });
  } catch (err) {
    next(err);
  }
});

  return router;
}

module.exports = createOrderAvailableRouter;
