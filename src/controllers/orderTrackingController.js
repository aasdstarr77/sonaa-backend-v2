'use strict';

module.exports = function createOrderTrackingController(dependencies) {
  const { Order, Fanni, Rating, mongoose, validSN, verifyClientToken, publicOrder, publicRatings } = dependencies;
  return async function trackOrder(req, res, next) {
  try {
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOne({ sn });

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    const isOrderOwner = await verifyClientToken(req, order);
    if (!isOrderOwner) {
      return res.status(403).json({ message: 'سجّل الدخول بحسابك لمتابعة الطلب؛ رقم الطلب وحده لا يكفي لعرض بياناته.' });
    }

    // ملء مستوى وشارات الفني للعروض القديمة دون كشف رقم الهاتف أو بيانات الحساب.
    const fanniIds = [...new Set((order.offers || []).map(offer => String(offer.fanni || '')).filter(Boolean))];
    if (fanniIds.length) {
      const objectIds = fanniIds.filter(mongoose.isValidObjectId).map(id => new mongoose.Types.ObjectId(id));
      const [fannis, ratingStats, completedStats] = await Promise.all([
        Fanni.find({ _id: { $in: objectIds } }).select('_id level badges').lean(),
        Rating.aggregate([
          { $match: { fanniId: { $in: objectIds }, reviewerRole: 'client' } },
          { $group: { _id: '$fanniId', average: { $avg: '$stars' }, count: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: { assignedFanni: { $in: objectIds }, status: 'تم الانتهاء' } },
          { $group: { _id: '$assignedFanni', count: { $sum: 1 } } }
        ])
      ]);
      const fannisById = new Map(fannis.map(fanni => [String(fanni._id), fanni]));
      const ratingsById = new Map(ratingStats.map(item => [String(item._id), item]));
      const completedById = new Map(completedStats.map(item => [String(item._id), item.count]));
      for (const offer of order.offers || []) {
        const id = String(offer.fanni || '');
        const fanni = fannisById.get(id);
        const rating = ratingsById.get(id);
        offer.fanniLevel = fanni?.level || offer.fanniLevel || 'مبتدئ';
        offer.fanniBadges = Array.isArray(fanni?.badges) ? fanni.badges : (offer.fanniBadges || []);
        offer.fanniRatingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
        offer.fanniRatingCount = rating?.count || 0;
        offer.fanniCompletedJobs = completedById.get(id) || 0;
      }
    }

    const safe = publicOrder(order, {
      includeAddress: isOrderOwner,
      includeAssignedFanniPhone: isOrderOwner
    });
    safe.acceptedOfferId = order.acceptedOfferId ? String(order.acceptedOfferId) : null;
    safe.acceptedOfferPrice = order.acceptedOfferPrice ?? null;
    // Platform commission is internal financial data and must not be returned to clients.
    if (Array.isArray(safe.offers) && order.acceptedOfferId && ['تم اختيار فني', 'تم الانتهاء'].includes(order.status)) safe.offers = safe.offers.map(offer => ({ ...offer, offerStatus: String(offer._id) === String(order.acceptedOfferId) ? 'تم قبول العرض' : 'تم رفض العرض' }));
    safe.chatMessages = (order.chatMessages || []).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt }));
    safe.priceChangeRequests = (order.priceChangeRequests || []).map(r => ({ _id: String(r._id), oldPrice: r.oldPrice, newPrice: r.newPrice, reason: r.reason, status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt }));

    if (isOrderOwner && order.status === 'تم الانتهاء') {
      const ratings = await Rating.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
      safe.ratings = publicRatings(ratings);
      safe.myRating = publicRatings(ratings.filter(rating => rating.reviewerRole === 'client'))[0] || null;
      safe.canRate = !safe.myRating;
      safe.acceptedOfferPrice = order.acceptedOfferPrice ?? null;
      safe.assignedFanniName = order.assignedFanniName || safe.assignedFanniName || '';
    }

    return res.json({
      order: safe,
      data: safe
    });
  } catch (err) {
    next(err);
  }
};
};
