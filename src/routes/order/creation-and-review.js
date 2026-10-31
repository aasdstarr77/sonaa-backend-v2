'use strict';

module.exports = function registerOrderCreationAndReview(router, context) {
  const { express, Joi, mongoose, jwt, Order, createNotification, notifyAdmins, Fanni, Rating, WalletTransaction, AdminConfig, AdminAuditLog, writeOrderAdminAudit, createOrderTrackingController, auth, canAccessAdmin, isRootAdmin, clientAuth, generateSN, normalizePhone, ALL_SERVICES, CATEGORIES, normalizeServiceName, ACTIVE_STATUSES, ORDER_EXPIRY_HOURS, DEFAULT_COMMISSION_RATE, ARABIC_DIGITS, PERSIAN_DIGITS, createSchema, PROFESSIONAL_LEVEL_RANK, trackOrder, toWesternDigits, containsEgyptianMobile, sanitizeText, findPhoneContainingField, sanitizeOffer, publicOrder, fanniCanHandleService, validSN, clientTokenFrom, verifyClientToken, publicRatings, hasRatingBlock, currentPricing, money, autoPromoteFanni, getAcceptedOffer, hasAcceptedGuidelines, hasContactDetails } = context;

router.post('/', clientAuth, async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      // الاسم ورقم الهاتف مصدرهما الحساب الموثّق، وليس حقولًا يرسلها المتصفح.
      clientName: req.client.name,
      phone: req.client.phone,
      description: req.body.description || req.body.desc
    };

    const { error, value } = createSchema.validate(body, {
      abortEarly: false,
      stripUnknown: false
    });

    if (error) {
      return res.status(400).json({
        message: 'بيانات الطلب غير مكتملة أو غير صحيحة',
        details: error.details.map(item => item.message)
      });
    }

    const phoneInField = findPhoneContainingField({
      service: value.service,
      area: value.area,
      address: value.address || '',
      clientName: value.clientName || '',
      budget: value.budget || '',
      description: value.description || '',
      desc: value.desc || ''
    });

    if (phoneInField) {
      return res.status(400).json({
        message:
          'ممنوع كتابة رقم موبايل داخل الاسم أو المنطقة أو العنوان أو وصف الطلب أو الميزانية. استخدم خانة رقم الهاتف المخصصة.'
      });
    }

    const clientPhone = normalizePhone(value.phone);

    if (!clientPhone) {
      return res.status(400).json({
        message: 'رقم هاتف العميل غير صحيح'
      });
    }

    const address = String(value.address || '').trim();
    // المنطقة حقل مستقل يظهر للفني قبل قبول الطلب؛ العنوان التفصيلي يظل محميًا حتى القبول.
    const area = String(value.area || '').trim();

    if (area.length < 2 || area.length > 100) {
      return res.status(400).json({
        message: 'اكتب المنطقة أو الحي بشكل صحيح'
      });
    }

    if (address.length < 2) {
      return res.status(400).json({
        message: 'العنوان التفصيلي مطلوب'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'إنشاء الطلب غير متاح بسبب إعدادات الخادم'
      });
    }

    const textDescription = String(value.description || value.desc || '').trim();
    const voiceRecordingData = String(value.voiceRecordingData || '').trim();
    if (textDescription.length < 10 && !voiceRecordingData) return res.status(400).json({ message: 'اكتب وصف المشكلة أو سجّل فويس يوضح المشكلة قبل إرسال الطلب.' });
    const safeDescription = sanitizeText(textDescription);

    const safeClientName = sanitizeText(
      String(value.clientName || 'عميل').trim()
    );

    let order = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await Order.create({
          sn: generateSN(),
          clientAccount: req.clientId,
      clientAccountLinkedAt: new Date(),
          service: value.service,
          area,
          address,
          clientName: safeClientName || 'عميل',
          clientPhone,
          budget: value.budget || '',
          description: safeDescription,
          ...(voiceRecordingData ? { voiceRecordingData } : {}),
          status: 'قيد المراجعة'
        });

        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 2) throw err;
      }
    }

    if (!order) {
      return res.status(500).json({
        message: 'تعذر إنشاء الطلب'
      });
    }

    await notifyAdmins({ type: 'admin_new_order', title: 'طلب جديد يحتاج مراجعة', message: `وصل طلب جديد ${order.sn} لخدمة ${order.service}.`, link: '/admin?tab=orders', dedupeKey: 'admin-new-order:' + String(order._id) });
    await createNotification({
      recipientRole: 'client', recipientId: order.clientAccount, type: 'order_created',
      title: 'تم استلام طلبك', message: 'استلمنا طلبك ' + order.sn + ' وسيتم مراجعته من الإدارة.',
      link: '/?tab=orders', dedupeKey: 'order-created:' + String(order._id)
    });

    const clientToken = jwt.sign(
      {
        purpose: 'client-order',
        accountId: String(order.clientAccount),
        tokenVersion: Number(req.client?.tokenVersion || 0),
        orderId: String(order._id),
        sn: order.sn
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const safeOrder = publicOrder(order);

    return res.status(201).json({
      message: 'تم إنشاء الطلب بنجاح، وسيتم مراجعته من الإدارة',
      sn: order.sn,
      id: order._id,
      clientToken,
      order: safeOrder,
      data: safeOrder
    });
  } catch (err) {
    next(err);
  }
});

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
};
