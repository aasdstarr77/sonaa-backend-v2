'use strict';

const express = require('express');

function createOrderOfferRouter({
  Order, Rating, Fanni, auth, hasAcceptedGuidelines, sanitizeOffer,
  publicRatings, normalizePhone, sanitizeText, hasRatingBlock, validSN,
  ACTIVE_STATUSES, currentPricing, DEFAULT_COMMISSION_RATE, money,
  findPhoneContainingField, fanniCanHandleService, createNotification, Joi
}) {
  const router = express.Router();

  router.get('/my-offers', auth(), async (req, res, next) => {
    try {
      if (req.user.role !== 'fanni') {
        return res.status(403).json({
          message: 'هذه الخدمة متاحة لحسابات الفنيين فقط'
        });
      }
      if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
  
      const orders = await Order.find({
        'offers.fanni': req.userId
      })
        .select(
          'sn service area address clientName clientPhone description budget status offers assignedFanni acceptedOfferId acceptedOfferPrice commissionRate commissionAmount commissionCharged chatMessages priceChangeRequests +voiceRecordingData'
        )
        .lean();
  
      const offers = [];
  
      for (const order of orders) {
        for (const offer of order.offers || []) {
          if (String(offer.fanni) !== String(req.userId)) continue;
  
          const isAssignedToThisFanni =
            String(order.assignedFanni || '') === String(req.userId) &&
            String(order.acceptedOfferId || '') === String(offer._id);
  
          const isCompletedByThisFanni =
            order.status === 'تم الانتهاء' &&
            isAssignedToThisFanni;
  
          const isAcceptedByThisFanni =
            isAssignedToThisFanni &&
            ['تم اختيار فني', 'تم الانتهاء'].includes(order.status);
  
          const safeOffer = {
            ...sanitizeOffer(offer),
            orderSn: order.sn,
            orderStatus: order.status,
            chatMessages: (order.chatMessages || []).filter(m => isAcceptedByThisFanni ? String(m.targetOfferId || '') === String(order.acceptedOfferId || '') : String(m.targetOfferId || '') === String(offer._id)).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt })),
            service: order.service,
            hasVoiceRecording: Boolean(order.voiceRecordingData),
            accepted: isAcceptedByThisFanni,
            completed: isCompletedByThisFanni
          };
  
          if (isCompletedByThisFanni) {
            const ratings = await Rating.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
            safeOffer.ratings = publicRatings(ratings);
            safeOffer.myRating = publicRatings(
              ratings.filter(rating => rating.reviewerRole === 'fanni')
            )[0] || null;
          }
  
          if (isAcceptedByThisFanni) {
            const clientPhone = normalizePhone(order.clientPhone || '');
            const [clientRatingStats, clientCompletedJobs] = clientPhone ? await Promise.all([
              Rating.aggregate([
                { $match: { clientPhone, reviewerRole: 'fanni' } },
                { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } }
              ]),
              Order.countDocuments({ clientPhone, status: 'تم الانتهاء' })
            ]) : [[], 0];
            const clientRating = clientRatingStats[0] || { average: 0, count: 0 };
            safeOffer.client = {
              name: sanitizeText(order.clientName || ''),
              area: order.area || '',
              address: order.address || '',
              description: sanitizeText(order.description || ''),
              budget: order.budget || '',
              acceptedOfferPrice: order.acceptedOfferPrice,
              commissionAmount: order.commissionAmount,
              commissionCharged: Boolean(order.commissionCharged),
              ratingAverage: Math.round(Number(clientRating.average || 0) * 100) / 100,
              ratingCount: Number(clientRating.count || 0),
              completedJobs: Number(clientCompletedJobs || 0)
            };
            if (!isCompletedByThisFanni) safeOffer.client.phone = order.clientPhone || '';
          }
  
          offers.push(safeOffer);
        }
      }
  
      return res.json({
        offers,
        data: offers
      });
    } catch (err) {
      next(err);
    }
  });
  
  router.post('/:sn/offer', auth(), async (req, res, next) => {
    try {
      if (req.user.role !== 'fanni') {
        return res.status(403).json({
          message: 'تقديم العروض متاح للفنيين فقط'
        });
      }
  
      if (req.user.status !== 'معتمد') {
        return res.status(403).json({
          message: 'حساب الفني لم يتم اعتماده بعد'
        });
      }
      if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
  
      const sn = String(req.params.sn || '').toUpperCase();
  
      if (!validSN(sn)) {
        return res.status(400).json({
          message: 'كود الطلب غير صحيح'
        });
      }
  
      const activeTask = await Order.exists({ assignedFanni: req.userId, status: 'تم اختيار فني' });
      if (activeTask) {
        return res.status(409).json({ message: 'لديك مهمة جارية حاليًا. برجاء إنهاء المهمة الحالية أولًا قبل التقدم لأي طلب جديد.' });
      }
  
      const schema = Joi.object({
        price: Joi.number().positive().max(1000000).required(),
        message: Joi.string().trim().min(5).max(500).required()
      });
  
      const result = schema.validate(req.body, {
        abortEarly: false
      });
  
      if (result.error) {
        return res.status(400).json({
          message: 'السعر والرسالة مطلوبان بشكل صحيح'
        });
      }
  
      const phoneInMessage = findPhoneContainingField({
        message: result.value.message
      });
  
      if (phoneInMessage) {
        return res.status(400).json({
          message: 'ممنوع كتابة رقم موبايل داخل رسالة العرض.'
        });
      }
  
      const price = money(result.value.price);
      const pricing = await currentPricing();
      if (price < Number(pricing.minOffer || 1) || price > Number(pricing.maxOffer || 1000000)) {
        return res.status(400).json({ message: `سعر العرض يجب أن يكون بين ${Number(pricing.minOffer || 1)} و${Number(pricing.maxOffer || 1000000)} جنيه` });
      }
      const commissionRate = Number.isFinite(Number(pricing.commission)) ? Number(pricing.commission) : DEFAULT_COMMISSION_RATE;
      const commissionAmount = money(price * commissionRate / 100);
  
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(commissionAmount) ||
        commissionAmount < 0
      ) {
        return res.status(400).json({
          message: 'سعر العرض غير صالح'
        });
      }
  
      const order = await Order.findOne({ sn });
  
      if (!order) {
        return res.status(404).json({
          message: 'الطلب غير موجود'
        });
      }
  
      if (!ACTIVE_STATUSES.includes(order.status)) {
        return res.status(409).json({
          message: 'الطلب غير منشور أو لم يعد متاحًا للعروض'
        });
      }
  
      if (order.expiresAt && order.expiresAt <= new Date()) {
        return res.status(409).json({
          message: 'انتهت مدة استقبال العروض لهذا الطلب'
        });
      }
  
      /*
       * فحص التخصص هنا ضروري أيضًا:
       * لا نعتمد على إخفاء الطلب من الواجهة فقط،
       * لأن الفني قد يحاول إرسال عرض باستخدام رقم الطلب مباشرة.
       */
      const fanni = await Fanni.findOne({
        _id: req.userId,
        role: 'fanni',
        status: 'معتمد'
      }).select('specialties walletBalance level isFrozen limits badges isVerified isFeatured featuredUntil');
  
      if (!fanni) {
        return res.status(403).json({
          message: 'حساب الفني غير موجود أو غير معتمد'
        });
      }
  
      if (fanni.isFrozen === true) {
        return res.status(403).json({ message: 'محفظتك مجمدة مؤقتًا؛ تواصل مع الإدارة قبل تقديم عروض جديدة' });
      }
      if (fanni.limits?.isLimited === true) {
        return res.status(403).json({ message: 'حسابك عليه حدود استقبال تمنع تقديم عروض جديدة حاليًا' });
      }
  
      if (!fanniCanHandleService(fanni.specialties, order.service)) {
        return res.status(403).json({
          message: 'هذا الطلب خارج تخصصات حسابك المعتمدة'
        });
      }
  
      if (await hasRatingBlock({ clientPhone: order.clientPhone, fanniId: req.userId })) {
        return res.status(403).json({
          message: 'لا يمكنك تقديم عرض على هذا الطلب بناءً على إعدادات التقييم السابقة'
        });
      }
  
      const clientBlockedThisFanni = await Rating.exists({
        reviewerRole: 'client',
        fanniId: req.userId,
        clientPhone: normalizePhone(order.clientPhone),
        blockFuture: true
      });
      if (clientBlockedThisFanni) {
        return res.status(403).json({
          message: 'هذا العميل طلب عدم إظهار طلباته لك'
        });
      }
  
      const alreadySent = order.offers.some(
        offer => String(offer.fanni) === String(req.userId)
      );
  
      if (alreadySent) {
        return res.status(409).json({
          message: 'سبق أن أرسلت عرضًا لهذا الطلب'
        });
      }
  
      const maxActiveOffers = Number.isInteger(Number(fanni.limits?.maxOffers)) ? Number(fanni.limits.maxOffers) : 50;
      if (maxActiveOffers <= 0) return res.status(403).json({ message: 'حد العروض النشطة المسموح به لحسابك يساوي صفرًا. راجع الإدارة.' });
      const activeOfferCount = await Order.countDocuments({ status: { $in: ACTIVE_STATUSES }, offers: { $elemMatch: { fanni: req.userId } } });
      if (activeOfferCount >= maxActiveOffers) return res.status(429).json({ message: `وصلت إلى الحد الأقصى للعروض النشطة (${maxActiveOffers}). انتظر انتهاء عرض قائم أو تواصل مع الإدارة.` });
  
      const dailyOfferLimit = Number.isInteger(Number(fanni.limits?.dailyLimit)) ? Number(fanni.limits.dailyLimit) : 10;
      if (dailyOfferLimit <= 0) return res.status(403).json({ message: 'حد العروض خلال آخر 24 ساعة يساوي صفرًا. راجع الإدارة.' });
      const sinceLast24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const offersLast24Hours = await Order.countDocuments({ offers: { $elemMatch: { fanni: req.userId, date: { $gte: sinceLast24Hours } } } });
      if (offersLast24Hours >= dailyOfferLimit) return res.status(429).json({ message: `وصلت إلى الحد الأقصى للعروض خلال آخر 24 ساعة (${dailyOfferLimit}). حاول لاحقًا.` });
  
      const walletBalance = Number(fanni.walletBalance || 0);
  
      if (
        !Number.isFinite(walletBalance) ||
        walletBalance < commissionAmount
      ) {
        return res.status(409).json({
          message: 'رصيد محفظتك لا يكفي لعمولة 10% من قيمة هذا العرض',
          offerPrice: price,
          requiredCommission: commissionAmount,
          walletBalance: Number.isFinite(walletBalance)
            ? walletBalance
            : 0
        });
      }
  
      const offerCreatedAt = new Date();
      const offerBadges = new Set(Array.isArray(fanni.badges) ? fanni.badges : []);
      if (fanni.isVerified === true) offerBadges.add('verified');
      if (fanni.isFeatured === true && (!fanni.featuredUntil || new Date(fanni.featuredUntil) > offerCreatedAt)) offerBadges.add('premium');
      const offerPayload = {
        fanni: req.userId,
        fanniId: String(req.userId),
        fanniName: req.user.name,
        fanniLevel: fanni.level || 'مبتدئ',
        fanniBadges: Array.from(offerBadges),
        fanniPhone: req.user.phone,
        price: String(price),
        priceNum: price,
        message: sanitizeText(result.value.message)
      };
  
      // Make the "one offer per technician per order" rule atomic. A read/check
      // followed by order.save() can race when two requests arrive together.
      const updatedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: { $in: ACTIVE_STATUSES },
          'offers.fanni': { $ne: req.userId },
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: offerCreatedAt } }
          ]
        },
        {
          $push: { offers: offerPayload },
          $set: { status: 'وصلتك عروض' }
        },
        { new: true, runValidators: true }
      );
  
      if (!updatedOrder) {
        const latestOrder = await Order.findById(order._id).select('status expiresAt offers.fanni').lean();
        if (latestOrder?.offers?.some(offer => String(offer.fanni) === String(req.userId))) {
          return res.status(409).json({ message: 'سبق أن أرسلت عرضًا لهذا الطلب' });
        }
        if (!latestOrder || !ACTIVE_STATUSES.includes(latestOrder.status)) {
          return res.status(409).json({ message: 'الطلب غير منشور أو لم يعد متاحًا للعروض' });
        }
        if (latestOrder.expiresAt && latestOrder.expiresAt <= new Date()) {
          return res.status(409).json({ message: 'انتهت مدة استقبال العروض لهذا الطلب' });
        }
        return res.status(409).json({ message: 'تعذر تسجيل العرض بسبب تحديث متزامن. حدّث الطلب وحاول مرة أخرى.' });
      }
  
      await createNotification({
        recipientRole: 'client', recipientId: order.clientAccount, type: 'new_offer',
        title: 'وصلك عرض جديد', message: 'فني أرسل عرضًا على طلبك ' + order.sn + '. افتح طلباتي لمراجعته.',
        link: '/?tab=orders', dedupeKey: 'new-offer:' + String(order._id) + ':' + String(req.userId)
      });
  
      return res.status(201).json({
        message: 'تم إرسال العرض بنجاح. لم يتم خصم أي مبلغ من محفظتك.',
        orderSn: order.sn,
        requiredCommission: commissionAmount,
        walletBalance,
        offers: updatedOrder.offers.map(offer => {
          const safeOffer =
            typeof offer.toObject === 'function'
              ? offer.toObject()
              : { ...offer };
  
          delete safeOffer.fanniPhone;
          delete safeOffer.phone;
  
          if (typeof safeOffer.message === 'string') {
            safeOffer.message = sanitizeText(safeOffer.message);
          }
  
          return safeOffer;
        })
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createOrderOfferRouter;
