'use strict';

module.exports = function registerOrderChatAndPrice(router, context) {
  const { express, Joi, mongoose, jwt, Order, createNotification, notifyAdmins, Fanni, Rating, WalletTransaction, AdminConfig, AdminAuditLog, writeOrderAdminAudit, createOrderTrackingController, auth, canAccessAdmin, isRootAdmin, clientAuth, generateSN, normalizePhone, ALL_SERVICES, CATEGORIES, normalizeServiceName, ACTIVE_STATUSES, ORDER_EXPIRY_HOURS, DEFAULT_COMMISSION_RATE, ARABIC_DIGITS, PERSIAN_DIGITS, createSchema, PROFESSIONAL_LEVEL_RANK, trackOrder, toWesternDigits, containsEgyptianMobile, sanitizeText, findPhoneContainingField, sanitizeOffer, publicOrder, fanniCanHandleService, validSN, clientTokenFrom, verifyClientToken, publicRatings, hasRatingBlock, currentPricing, money, autoPromoteFanni, getAcceptedOffer, hasAcceptedGuidelines, hasContactDetails } = context;

router.get('/:sn/chat', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const isClient = await verifyClientToken(req, order);
    const token = String(req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    let fanniId = null;
    if (token && process.env.JWT_SECRET) { try { const payload = jwt.verify(token, process.env.JWT_SECRET); if (payload.id) fanniId = payload.id; } catch (_) {} }
    const technicianOffer = fanniId && (order.offers || []).find(o => String(o.fanni) === String(fanniId));
    if (!isClient && !technicianOffer) return res.status(403).json({ message: 'غير مسموح بعرض محادثة هذا الطلب.' });
    if (!isClient && !(await hasAcceptedGuidelines(fanniId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    const accepted = ['تم اختيار فني', 'تم الانتهاء'].includes(order.status);
    if (!isClient && accepted && String(order.assignedFanni || '') !== String(fanniId)) return res.status(403).json({ message: 'المحادثة بعد القبول متاحة للفني المعيّن فقط.' });
    const requestedOfferId = String(req.query?.offerId || '').trim();
    const visibleMessages = (order.chatMessages || []).filter(m => {
      if (accepted) return isClient ? (!m.targetOfferId || String(m.targetOfferId) === String(order.acceptedOfferId || '')) : String(m.targetOfferId || '') === String(order.acceptedOfferId || '');
      if (isClient) return Boolean(m.targetOfferId) && (!requestedOfferId || String(m.targetOfferId) === requestedOfferId);
      return String(m.targetOfferId || '') === String(technicianOffer._id);
    }).map(m => ({ senderRole: m.senderRole, text: m.text, targetOfferId: m.targetOfferId || '', createdAt: m.createdAt }));
    return res.json({ messages: visibleMessages, priceChangeRequests: accepted ? (order.priceChangeRequests || []) : [] });
  } catch (err) { next(err); }
});

router.post('/:sn/chat', async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح' });
    const text = String(req.body?.text || req.body?.reply || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ message: 'اكتب الرسالة أولًا.' });
    if (hasContactDetails(text)) return res.status(400).json({ message: 'ممنوع تبادل أرقام الهاتف أو الروابط داخل المحادثة.' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const isClient = await verifyClientToken(req, order);
    const token = String(req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    let payload = null;
    if (token && process.env.JWT_SECRET) { try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch (_) {} }
    const fanniId = payload?.id;
    const ownOffer = fanniId && (order.offers || []).find(o => String(o.fanni) === String(fanniId));
    if (!isClient && !ownOffer) return res.status(403).json({ message: 'غير مسموح بإرسال رسالة لهذا الطلب.' });
    if (!isClient && !(await hasAcceptedGuidelines(fanniId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    if (order.status === 'تم الانتهاء') return res.status(409).json({ message: 'المهمة مكتملة؛ المحادثة للقراءة فقط.' });
    const accepted = order.status === 'تم اختيار فني';
    const targetOfferId = String(req.body?.offerId || (accepted ? order.acceptedOfferId || '' : '')).trim();
    if (accepted) {
      if (!order.acceptedOfferId || targetOfferId !== String(order.acceptedOfferId)) return res.status(409).json({ message: 'المحادثة متاحة للعرض المقبول فقط.' });
      if (!isClient && String(order.assignedFanni || '') !== String(fanniId || '')) return res.status(403).json({ message: 'المحادثة بعد القبول متاحة للفني المعيّن فقط.' });
    } else {
      if (!ACTIVE_STATUSES.includes(order.status)) return res.status(409).json({ message: 'المحادثة غير متاحة في حالة الطلب الحالية.' });
      if (!mongoose.isValidObjectId(targetOfferId)) return res.status(400).json({ message: 'حدد العرض الذي تخصه المحادثة.' });
      const targetOffer = (order.offers || []).find(o => String(o._id) === targetOfferId);
      if (!targetOffer) return res.status(404).json({ message: 'العرض غير موجود في هذا الطلب.' });
      if (!isClient && String(targetOffer.fanni) !== String(fanniId)) return res.status(403).json({ message: 'لا يمكنك الرد إلا على استفسارات العرض الخاص بك.' });
      if (isClient && !['هل السعر شامل؟', 'متى تقدر تيجي؟', 'هل في تكلفة إضافية؟'].includes(text)) return res.status(400).json({ message: 'قبل قبول العرض، استخدم أحد أزرار الاستفسارات السريعة.' });
      if (!isClient && !['نعم', 'لا', 'حسب الاتفاق'].includes(text)) return res.status(400).json({ message: 'قبل قبول العرض، ردود الفني المسموحة فقط: نعم، لا، حسب الاتفاق.' });
    }
    order.chatMessages.push({ senderRole: isClient ? 'client' : 'fanni', senderId: isClient ? String(order.clientAccount || order._id) : String(fanniId), targetOfferId, text, createdAt: new Date() });
    await order.save();

    // Notify the other participant for every newly sent order-chat message.
    // Before acceptance, a client message is routed only to the technician who owns that offer.
    const targetOffer = (order.offers || []).find(o => String(o._id) === targetOfferId);
    const recipientRole = isClient ? 'fanni' : 'client';
    const recipientId = isClient
      ? (accepted ? order.assignedFanni : targetOffer?.fanni)
      : order.clientAccount;
    if (recipientId) {
      await createNotification({
        recipientRole,
        recipientId,
        type: 'order_message',
        title: isClient ? 'رسالة جديدة من العميل' : 'رسالة جديدة من الفني',
        message: 'طلب ' + order.sn + ': ' + text.slice(0, 140),
        link: '/?tab=orders'
      });
    }

    return res.status(201).json({ message: 'تم إرسال الرسالة.', messages: order.chatMessages.filter(m => accepted ? (!m.targetOfferId || String(m.targetOfferId) === targetOfferId) : String(m.targetOfferId || '') === targetOfferId) });
  } catch (err) { next(err); }
});

router.post('/:sn/price-change', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'fanni') return res.status(403).json({ message: 'طلب تعديل السعر متاح للفني المعيّن فقط.' });
    if (!(await hasAcceptedGuidelines(req.userId))) return res.status(428).json({ code: 'TECHNICIAN_GUIDELINES_REQUIRED', message: 'يجب الموافقة على ميثاق التعامل المهني أولًا.' });
    const sn = String(req.params.sn || '').toUpperCase(), newPrice = money(req.body?.newPrice), reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!validSN(sn) || !Number.isFinite(newPrice) || newPrice <= 0 || reason.length < 5) return res.status(400).json({ message: 'اكتب سعرًا جديدًا صحيحًا وسببًا واضحًا للتعديل.' });
    const order = await Order.findOne({ sn }); if (!order) return res.status(404).json({ message: 'الطلب غير موجود.' });
    if (order.status !== 'تم اختيار فني' || String(order.assignedFanni) !== String(req.userId) || !order.acceptedOfferPrice) return res.status(409).json({ message: 'لا يمكن طلب تعديل السعر إلا للطلب المسند إليك قبل إنهائه.' });
    const currentPrice = money(order.acceptedOfferPrice);
    if (newPrice <= currentPrice) return res.status(400).json({ message: 'السعر الجديد لازم يكون أعلى من السعر الحالي (' + currentPrice + ' جنيه). لا يمكن تخفيض السعر بعد قبول العرض.' });
    if ((order.priceChangeRequests || []).some(r => r.status === 'قيد الموافقة')) return res.status(409).json({ message: 'يوجد طلب تعديل سعر ينتظر موافقة العميل بالفعل.' });
    order.priceChangeRequests.push({ fanniId: req.userId, oldPrice: order.acceptedOfferPrice, newPrice, reason, status: 'قيد الموافقة', requestedAt: new Date() }); await order.save();
    await createNotification({
      recipientRole: 'client',
      recipientId: order.clientAccount,
      type: 'price_change_requested',
      title: 'الفني طلب زيادة السعر',
      message: 'طلب الفني تعديل سعر الطلب ' + order.sn + ' من ' + currentPrice + ' إلى ' + newPrice + ' جنيه. راجع السبب ووافق أو ارفض من المحادثة.',
      link: '/?tab=orders',
      dedupeKey: 'price-change-request:' + String(order._id) + ':' + String(order.priceChangeRequests[order.priceChangeRequests.length - 1]._id)
    });
    return res.status(201).json({ message: 'تم إرسال طلب تعديل السعر للعميل؛ لا تنفذ الزيادة قبل موافقته.', request: order.priceChangeRequests[order.priceChangeRequests.length - 1] });
  } catch (err) { next(err); }
});

router.post('/:sn/price-change/:requestId/decision', async (req, res, next) => {
  let session;
  try {
    const sn = String(req.params.sn || '').toUpperCase();
    if (!validSN(sn)) return res.status(400).json({ message: 'كود الطلب غير صحيح.' });
    session = await mongoose.startSession();
    await session.startTransaction();
    const order = await Order.findOne({ sn }).session(session);
    if (!order) { await session.abortTransaction(); return res.status(404).json({ message: 'الطلب غير موجود.' }); }
    if (!(await verifyClientToken(req, order))) { await session.abortTransaction(); return res.status(403).json({ message: 'غير مسموح بتعديل سعر هذا الطلب.' }); }
    if (order.status === 'تم الانتهاء') { await session.abortTransaction(); return res.status(409).json({ message: 'المهمة مكتملة؛ لا يمكن اتخاذ قرار جديد بشأن تعديل السعر.' }); }
    const request = order.priceChangeRequests.id(req.params.requestId);
    if (!request || request.status !== 'قيد الموافقة') { await session.abortTransaction(); return res.status(409).json({ message: 'طلب تعديل السعر غير متاح أو تم اتخاذ قرار بشأنه.' }); }
    const approved = req.body?.approved === true;
    if (approved) {
      if (!order.commissionCharged || !order.acceptedOfferPrice || !request.fanniId) { await session.abortTransaction(); return res.status(409).json({ message: 'تعذر اعتماد تعديل السعر قبل تثبيت العرض والعمولة.' }); }
      const rate = Number.isFinite(Number(order.commissionRate)) ? Number(order.commissionRate) : DEFAULT_COMMISSION_RATE;
      const oldCommission = money(Number(order.commissionAmount || 0));
      const newCommission = money(Number(request.newPrice) * rate / 100);
      const delta = money(newCommission - oldCommission);
      const fanni = await Fanni.findOne({ _id: request.fanniId, role: 'fanni' }).session(session);
      if (!fanni) { await session.abortTransaction(); return res.status(409).json({ message: 'تعذر العثور على محفظة الفني لتنفيذ تسوية العمولة.' }); }
      const balanceBefore = Number(fanni.walletBalance || 0);
      if (!Number.isFinite(balanceBefore) || balanceBefore < 0 || (delta > 0 && balanceBefore < delta)) { await session.abortTransaction(); return res.status(409).json({ message: 'رصيد الفني لا يكفي لتسوية عمولة السعر الجديد؛ لم يتم اعتماد التعديل.' }); }
      let balanceAfter = balanceBefore;
      if (delta !== 0) {
        const updatedFanni = await Fanni.findOneAndUpdate(
          { _id: fanni._id, role: 'fanni', ...(delta > 0 ? { walletBalance: { $gte: delta } } : {}) },
          { $inc: { walletBalance: -delta } },
          { new: true, session, runValidators: true }
        );
        if (!updatedFanni) { await session.abortTransaction(); return res.status(409).json({ message: 'تغير رصيد الفني؛ لم يتم اعتماد تعديل السعر.' }); }
        balanceAfter = Number(updatedFanni.walletBalance);
        const transaction = new WalletTransaction({
          fanni: fanni._id, order: order._id, orderSN: order.sn, type: 'commission',
          amount: -delta, balanceBefore, balanceAfter,
          description: 'تسوية عمولة بعد موافقة العميل على تعديل سعر الطلب ' + order.sn,
          idempotencyKey: 'commission-adjustment:' + String(order._id) + ':' + String(request._id)
        });
        await transaction.save({ session });
      }
      order.acceptedOfferPrice = Number(request.newPrice);
      order.commissionAmount = newCommission;
      order.commissionRate = rate;
    }
    request.status = approved ? 'مقبول' : 'مرفوض';
    request.decidedAt = new Date();
    request.decidedByRole = 'client';
    order.chatMessages.push({
      senderRole: 'client',
      senderId: String(order.clientAccount || order._id),
      targetOfferId: String(order.acceptedOfferId || ''),
      text: approved
        ? 'وافقت على زيادة العرض إلى ' + Number(request.newPrice) + ' جنيه.'
        : 'رفضت زيادة العرض؛ السعر السابق ' + Number(request.oldPrice) + ' جنيه ما زال ساريًا.',
      createdAt: new Date()
    });
    await order.save({ session });
    await session.commitTransaction();
    await createNotification({
      recipientRole: 'fanni',
      recipientId: request.fanniId,
      type: approved ? 'price_change_approved' : 'price_change_rejected',
      title: approved ? 'وافق العميل على زيادة السعر' : 'رفض العميل زيادة السعر',
      message: approved
        ? 'وافق العميل على تعديل سعر الطلب ' + order.sn + ' إلى ' + order.acceptedOfferPrice + ' جنيه.'
        : 'رفض العميل تعديل سعر الطلب ' + order.sn + '. يظل السعر السابق ساريًا.',
      link: '/fanni',
      dedupeKey: 'price-change-decision:' + String(order._id) + ':' + String(request._id)
    });
    return res.json({ message: approved ? 'تمت الموافقة على السعر الجديد.' : 'تم رفض تعديل السعر؛ يظل السعر السابق ساريًا.', acceptedOfferPrice: order.acceptedOfferPrice, request });
  } catch (err) {
    if (session && session.inTransaction()) { try { await session.abortTransaction(); } catch (_) {} }
    if (err && err.code === 11000) return res.status(409).json({ message: 'تمت معالجة تسوية العمولة بالفعل.' });
    next(err);
  } finally {
    if (session) await session.endSession();
  }
});
};
