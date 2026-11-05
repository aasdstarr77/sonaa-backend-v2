'use strict';

const express = require('express');

function createOrderAvailableRouter({
  auth,
  Order,
  ACTIVE_STATUSES,
  ALL_SERVICES,
  Fanni,
  Rating,
  normalizePhone,
  fanniCanHandleService,
  fanniWorksInArea,
  publicOrder
}) {
  const router = express.Router();

router.get('/available', auth(), async (req, res, next) => {
  try {
    const parsedPage = Number.parseInt(req.query.page, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    let specialties = [];
    let technicianAreas = [];
    let blockedPhones = [];

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
      }).select('specialties areas technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();
      if (!fanni) {
        return res.status(403).json({
          message: 'حساب الفني غير موجود أو غير معتمد'
        });
      }

      if (!fanni.technicianGuidelinesAcceptedAt || !fanni.technicianGuidelinesVersion) {
        return res.status(428).json({
          code: 'TECHNICIAN_GUIDELINES_REQUIRED',
          message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.'
        });
      }

      specialties = Array.isArray(fanni.specialties)
        ? fanni.specialties
        : [];
      technicianAreas = Array.isArray(fanni.areas) ? fanni.areas : [];

      if (specialties.length === 0) {
        return res.set('Cache-Control', 'no-store').json({ orders: [], data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
      const matchingServices = ALL_SERVICES.filter(service => fanniCanHandleService(specialties, service));
      if (!matchingServices.length) {
        return res.set('Cache-Control', 'no-store').json({ orders: [], data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
      const [blockedRatings, clientBlocks] = await Promise.all([
        Rating.find({ fanniId: req.userId, blockFuture: true }).select('clientPhone').lean(),
        Rating.find({ reviewerRole: 'client', fanniId: req.userId, blockFuture: true }).select('clientPhone').lean()
      ]);
      blockedPhones = [...new Set([...blockedRatings, ...clientBlocks].map(item => normalizePhone(item.clientPhone)).filter(Boolean))];
    }

    const query = { status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: new Date() } };
    if (req.user.role !== 'admin') {
      query.service = { $in: ALL_SERVICES.filter(service => fanniCanHandleService(specialties, service)) };
      query.$or = technicianAreas.length
        ? [{ areaMatchingEnabled: { $ne: true } }, { area: { $in: technicianAreas } }]
        : [{ areaMatchingEnabled: { $ne: true } }];
      if (blockedPhones.length) query.clientPhone = { $nin: blockedPhones };
    }
    const [total, orders] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .select('-phone -address -clientName +voiceRecordingData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);
    const matchingOrders = req.user.role === 'admin' ? orders : orders.filter(order =>
      fanniCanHandleService(specialties, order.service) &&
      (order.areaMatchingEnabled !== true || fanniWorksInArea(technicianAreas, order.area)) &&
      !blockedPhones.includes(normalizePhone(order.clientPhone))
    );

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

    return res.set('Cache-Control', 'no-store').json({
      orders: safeOrders,
      data: safeOrders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

  return router;
}

module.exports = createOrderAvailableRouter;
