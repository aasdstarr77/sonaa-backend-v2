'use strict';

const express = require('express');

function createOrderTrackingRouter({
  Order,
  Rating,
  Fanni,
  mongoose,
  ACTIVE_STATUSES,
  validSN,
  verifyClientToken,
  publicOrder,
  publicRatings,
  auth,
  isRootAdmin,
  canAccessAdmin,
  fanniCanHandleService
}) {
  const router = express.Router();

  async function trackOrder(req, res, next) {
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
  }
  
  router.get('/:sn/voice', auth(), async (req,res,next)=>{try{const sn=String(req.params.sn||'').toUpperCase();if(!validSN(sn))return res.status(400).json({message:'كود الطلب غير صحيح'});const order=await Order.findOne({sn}).select('+voiceRecordingData status service assignedFanni expiresAt').lean();if(!order||!order.voiceRecordingData)return res.status(404).json({message:'لا يوجد تسجيل صوتي لهذا الطلب.'});let permitted=false;const adminAccount=req.user?.role==='admin'||Boolean(req.user?.adminRole);if(adminAccount){const scopedReq={...req,path:'/'+sn+'/voice',method:'GET'};if(!isRootAdmin(req.user)&&!canAccessAdmin(req.user,scopedReq))return res.status(403).json({message:'ليس لديك صلاحية قراءة التسجيلات الصوتية.'});permitted=true;}if(!permitted&&req.user?.role==='fanni'&&req.user?.status==='معتمد'){const fanni=await Fanni.findOne({_id:req.userId,role:'fanni',status:'معتمد'}).select('specialties technicianGuidelinesAcceptedAt technicianGuidelinesVersion').lean();const assigned=order.status==='تم اختيار فني'&&String(order.assignedFanni)===String(req.userId);const available=ACTIVE_STATUSES.includes(order.status)&&order.expiresAt&&new Date(order.expiresAt)>new Date()&&fanni?.technicianGuidelinesAcceptedAt&&fanni?.technicianGuidelinesVersion&&fanniCanHandleService(fanni?.specialties||[],order.service);permitted=Boolean(assigned||available)}if(!permitted)return res.status(403).json({message:'التسجيل الصوتي غير متاح لهذا الحساب.'});const match=/^data:(audio\/(?:webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-zA-Z0-9.-]+)?);base64,([A-Za-z0-9+/]+={0,2})$/.exec(order.voiceRecordingData);if(!match)return res.status(415).json({message:'صيغة التسجيل الصوتي غير مدعومة.'});const audio=Buffer.from(match[2],'base64');res.set('Content-Type',match[1].split(';')[0]);res.set('Content-Length',String(audio.length));res.set('Cache-Control','private, no-store');return res.send(audio)}catch(err){return next(err)}});
  router.get('/by-sn/:sn', trackOrder);
  router.get('/:sn', trackOrder);

  return router;
}

module.exports = createOrderTrackingRouter;
