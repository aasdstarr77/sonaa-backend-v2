'use strict';

module.exports = function registerOrderLifecycle(router, context) {
  const { express, Joi, mongoose, jwt, Order, createNotification, notifyAdmins, Fanni, Rating, WalletTransaction, AdminConfig, AdminAuditLog, writeOrderAdminAudit, createOrderTrackingController, auth, canAccessAdmin, isRootAdmin, clientAuth, generateSN, normalizePhone, ALL_SERVICES, CATEGORIES, normalizeServiceName, ACTIVE_STATUSES, ORDER_EXPIRY_HOURS, DEFAULT_COMMISSION_RATE, ARABIC_DIGITS, PERSIAN_DIGITS, createSchema, PROFESSIONAL_LEVEL_RANK, trackOrder, toWesternDigits, containsEgyptianMobile, sanitizeText, findPhoneContainingField, sanitizeOffer, publicOrder, fanniCanHandleService, validSN, clientTokenFrom, verifyClientToken, publicRatings, hasRatingBlock, currentPricing, money, autoPromoteFanni, getAcceptedOffer, hasAcceptedGuidelines, hasContactDetails } = context;

router.post('/:sn/accept', async (req, res, next) => {
  let session;
  let responsePayload = null;
  let responseStatus = 200;
  let notificationFanniId = null;
  let notificationClientId = null;
  let notificationOrderId = null;

  try {
    session = await mongoose.startSession();

    const sn = String(req.params.sn || '').toUpperCase();
    const offerId = String(req.body.offerId || '');

    if (!validSN(sn) || !mongoose.isValidObjectId(offerId)) {
      return res.status(400).json({
        message: 'كود الطلب أو العرض غير صحيح'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'الخدمة غير متاحة بسبب إعدادات الخادم'
      });
    }

    await session.startTransaction();

    const order = await Order.findOne({ sn }).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    if (!verifyClientToken(req, order)) {
      await session.abortTransaction();
      return res.status(403).json({
        message: 'لازم تستخدم رابط أو جلسة العميل صاحب الطلب لقبول العرض'
      });
    }

    if (!ACTIVE_STATUSES.includes(order.status)) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'تم اختيار فني بالفعل أو لم يعد الطلب متاحًا'
      });
    }

    if (order.expiresAt && order.expiresAt <= new Date()) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'انتهت مدة استقبال العروض لهذا الطلب'
      });
    }

    if (order.commissionCharged === true) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'تم تسجيل عمولة هذا الطلب بالفعل'
      });
    }

    const offer = getAcceptedOffer(order, offerId);

    if (!offer) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'العرض غير موجود'
      });
    }

    const price = Number(offer.priceNum);

    if (!Number.isFinite(price) || price <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'سعر العرض غير صالح، اطلب من الفني إرسال عرض صحيح'
      });
    }

    const pricing = await currentPricing();
    const commissionRate = Number.isFinite(Number(pricing.commission)) ? Number(pricing.commission) : DEFAULT_COMMISSION_RATE;
    const commissionAmount = money(price * commissionRate / 100);

    if (
      !Number.isFinite(commissionAmount) ||
      commissionAmount < 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'تعذر حساب عمولة الطلب بشكل صحيح'
      });
    }

    const fanniId = offer.fanni;

    const fanniBefore = await Fanni.findOne({
      _id: fanniId,
      role: 'fanni',
      status: 'معتمد',
      isFrozen: { $ne: true }
    }).session(session);

    if (!fanniBefore) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الفني صاحب العرض لم يعد حسابه معتمدًا'
      });
    }

    const balanceBefore = Number(fanniBefore.walletBalance || 0);

    if (
      !Number.isFinite(balanceBefore) ||
      balanceBefore < commissionAmount
    ) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'رصيد محفظة الفني غير كافٍ لسداد عمولة المنصة',
        requiredCommission: commissionAmount,
        walletBalance: Number.isFinite(balanceBefore)
          ? balanceBefore
          : 0
      });
    }

    const fanniAfter = await Fanni.findOneAndUpdate(
      {
        _id: fanniId,
        role: 'fanni',
        status: 'معتمد',
        isFrozen: { $ne: true },
        walletBalance: { $gte: commissionAmount }
      },
      {
        $inc: { walletBalance: -commissionAmount }
      },
      {
        new: true,
        session,
        runValidators: true
      }
    );

    if (!fanniAfter) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الرصيد تغيّر أو أصبح غير كافٍ؛ لم يتم قبول العرض أو خصم العمولة'
      });
    }

    const balanceAfter = Number(fanniAfter.walletBalance);

    const updateResult = await Order.updateOne(
      {
        _id: order._id,
        status: { $in: ACTIVE_STATUSES },
        commissionCharged: { $ne: true },
        expiresAt: { $gt: new Date() },
        'offers._id': offerId
      },
      {
        $set: {
          assignedFanni: fanniId,
          assignedFanniName: offer.fanniName,
          acceptedOfferId: offer._id,
          acceptedOfferPrice: price,
          commissionRate,
          commissionAmount,
          commissionCharged: true,
          commissionChargedAt: new Date(),
          status: 'تم اختيار فني'
        }
      },
      {
        session,
        runValidators: true
      }
    );

    if (updateResult.modifiedCount !== 1) {
      await session.abortTransaction();
      return res.status(409).json({
        message: 'الطلب لم يعد متاحًا؛ لم يتم تثبيت الخصم'
      });
    }

    const transaction = new WalletTransaction({
      fanni: fanniId,
      order: order._id,
      orderSN: order.sn,
      type: 'commission',
      amount: -commissionAmount,
      balanceBefore,
      balanceAfter,
      description: `عمولة منصة صُنّاع بنسبة ${commissionRate}% للطلب ${order.sn}`,
      idempotencyKey: `commission:${String(order._id)}`
    });

    await transaction.save({ session });

    const updatedOrder = await Order.findById(order._id).session(session);

    if (!updatedOrder) {
      throw new Error('ORDER_NOT_FOUND_AFTER_UPDATE');
    }

    notificationFanniId = fanniId;
    notificationClientId = updatedOrder.clientAccount || null;
    notificationOrderId = updatedOrder._id;

    responsePayload = {
      message: 'تم قبول العرض بنجاح',
      order: publicOrder(updatedOrder, {
        includeAddress: true,
        includeAssignedFanniPhone: true
      })
    };

    await session.commitTransaction();
  } catch (err) {
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }

    if (err && err.code === 11000) {
      responseStatus = 409;
      responsePayload = {
        message: 'توجد حركة مالية مسجلة لهذا الطلب بالفعل؛ لم يتم تكرار الخصم'
      };
    } else {
      return next(err);
    }
  } finally {
    if (session) await session.endSession();
  }

  if (responsePayload && responseStatus === 200 && responsePayload.order) {
    const acceptedOrder = responsePayload.order;
    await createNotification({
      recipientRole: 'fanni',
      recipientId: notificationFanniId,
      type: 'commission_deducted',
      title: 'تم خصم عمولة المنصة',
      message: 'تم خصم عمولة قدرها ' + Number(responsePayload.commission?.amount || 0) + ' جنيه (' + Number(responsePayload.commission?.rate || 0) + '%) من محفظتك عند قبول الطلب ' + acceptedOrder.sn + '.',
      link: '/fanni',
      dedupeKey: 'commission-deducted:' + String(notificationOrderId || acceptedOrder.sn)
    });
    await createNotification({
      recipientRole: 'fanni', recipientId: notificationFanniId, type: 'offer_accepted',
      title: 'تم قبول عرضك', message: 'العميل قبل عرضك على الطلب ' + acceptedOrder.sn + '.',
      link: '/fanni', dedupeKey: 'offer-accepted:' + String(notificationOrderId || acceptedOrder.sn)
    });
    const clientAccountId = notificationClientId;
    if (clientAccountId) {
      await createNotification({
        recipientRole: 'client', recipientId: clientAccountId, type: 'offer_accepted',
        title: 'تم اختيار الفني', message: 'تم قبول العرض على طلبك ' + acceptedOrder.sn + '.',
        link: '/?tab=orders', dedupeKey: 'client-offer-accepted:' + String(notificationOrderId || acceptedOrder.sn)
      });
    }
  }

  if (responsePayload) {
    return res.status(responseStatus).json(responsePayload);
  }

  return res.status(500).json({
    message: 'تعذر إكمال عملية قبول العرض'
  });
});

router.post('/:sn/cancel', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح.' });

    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود.' });
    if (!verifyClientToken(req, order)) {
      return res.status(403).json({ message: 'لا يمكن إلغاء طلب لا يخص حسابك.' });
    }
    if (order.assignedFanni || ['تم اختيار فني', 'تم الانتهاء'].includes(order.status)) {
      return res.status(409).json({ message: 'لا يمكن إلغاء الطلب بعد اختيار الفني. تواصل مع الإدارة للمساعدة.' });
    }
    if (['ملغي', 'مؤرشف', 'منتهي', 'منتهي - اعتذار'].includes(order.status)) {
      return res.status(409).json({ message: 'الطلب ملغي أو مغلق بالفعل.' });
    }

    order.status = 'ملغي';
    await order.save();

    if (order.clientAccount) {
      await createNotification({
        recipientRole: 'client',
        recipientId: order.clientAccount,
        type: 'order_cancelled',
        title: 'تم إلغاء الطلب',
        message: 'تم إلغاء طلبك ' + order.sn + ' بناءً على طلبك.',
        link: '/?tab=orders',
        dedupeKey: 'client-order-cancelled:' + String(order._id)
      });
    }

    return res.json({ message: 'تم إلغاء الطلب بنجاح.', order: publicOrder(order) });
  } catch (err) {
    next(err);
  }
});

router.post('/:sn/complete', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') {
      return res.status(403).json({
        message: 'إكمال المهمة متاح للفني المعيّن فقط'
      });
    }
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });

    const sn = String(req.params.sn || '').toUpperCase();

    if (!/^SN\d{6}$/.test(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOneAndUpdate(
      {
        sn,
        status: 'تم اختيار فني',
        assignedFanni: req.userId
      },
      {
        $set: { status: 'تم الانتهاء' }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!order) {
      const existing = await Order.findOne({ sn }).select(
        'sn status assignedFanni'
      );

      if (!existing) {
        return res.status(404).json({
          message: 'الطلب غير موجود'
        });
      }

      if (String(existing.assignedFanni || '') !== String(req.userId)) {
        return res.status(403).json({
          message: 'هذا الطلب غير مسند إليك'
        });
      }

      return res.status(409).json({
        message:
          existing.status === 'تم الانتهاء'
            ? 'المهمة مكتملة بالفعل'
            : 'حالة الطلب لا تسمح بإكمال المهمة'
      });
    }

    // لا يتم احتساب المهمة إلا بعد انتقال الطلب بنجاح إلى حالة مكتملة.
    await Fanni.updateOne(
      { _id: req.userId, role: 'fanni' },
      { $inc: { 'stats.completedJobs': 1 } }
    );
    await autoPromoteFanni(req.userId, 'إكمال المهمة ' + order.sn);
    await createNotification({
      recipientRole: 'client',
      recipientId: order.clientAccount,
      type: 'order_completed',
      title: 'الفني أنهى المهمة',
      message: 'تم تسجيل اكتمال الطلب ' + order.sn + '. افتح الطلب لتقييم الفني.',
      link: '/?tab=orders',
      dedupeKey: 'order-completed:' + String(order._id)
    });

    return res.json({
      message: 'تم إكمال المهمة بنجاح',
      order: {
        sn: order.sn,
        status: order.status
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:sn/assigned-details', auth(), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();

    if (!validSN(sn)) {
      return res.status(400).json({
        message: 'كود الطلب غير صحيح'
      });
    }

    const order = await Order.findOne({ sn }).select('+voiceRecordingData').lean();

    if (!order) {
      return res.status(404).json({
        message: 'الطلب غير موجود'
      });
    }

    if (
      order.status !== 'تم اختيار فني' ||
      !order.assignedFanni ||
      String(order.assignedFanni) !== String(req.userId) ||
      req.user.role !== 'fanni'
    ) {
      return res.status(403).json({
        message: 'تفاصيل العميل متاحة للفني المعيّن لهذا الطلب بعد قبول العرض فقط'
      });
    }

    return res.json({
      message: 'تم جلب تفاصيل الطلب المعيّن لك',
      order: {
        sn: order.sn,
        service: order.service,
        area: order.area,
        address: order.address,
        clientName: sanitizeText(order.clientName || ''),
        clientPhone: order.clientPhone,
        description: sanitizeText(order.description || ''),
        hasVoiceRecording: Boolean(order.voiceRecordingData),
        budget: order.budget || '',
        status: order.status,
        acceptedOfferPrice: order.acceptedOfferPrice,
        commissionAmount: order.commissionAmount,
        commissionCharged: order.commissionCharged
      }
    });
  } catch (err) {
    next(err);
  }
});

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

    if (verifyClientToken({ ...req, body: { ...(req.body || {}), clientToken: token }, headers: {} }, order)) {
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
};
