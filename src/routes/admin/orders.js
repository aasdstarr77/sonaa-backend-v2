'use strict';

const express = require('express');

function createAdminOrdersRouter({
  auth,
  validate,
  Joi,
  reasonSchema,
  MAX_LIST_LIMIT,
  Order,
  WalletTransaction,
  Fanni,
  AdminConfig,
  mongoose,
  normalizePhone,
  adminName,
  writeAdminAudit,
  createNotification,
  requireRootAdmin
}) {
  const router = express.Router();

router.get('/orders', auth('admin'), async (req, res, next) => {
  try {
    const filter = {};
    const status = String(req.query.status || '').trim();
    if (status) { filter.status = status; }
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIST_LIMIT) : MAX_LIST_LIMIT;
    const [orders, voiceOrders] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Order.find({ ...filter, voiceRecordingData: { $exists: true, $ne: '' } }).select('sn').lean()
    ]);
    const voiceOrderSNs = new Set(voiceOrders.map(order => String(order.sn || '').toUpperCase()));
    const safeOrders = orders.map(order => ({
      ...order,
      hasVoiceRecording: voiceOrderSNs.has(String(order.sn || '').toUpperCase())
    }));
    return res.json({ orders: safeOrders, data: safeOrders, items: safeOrders });
  } catch (err) { next(err); }
});



router.patch('/orders/:sn/correct', auth('admin'), validate(Joi.object({
  clientName: Joi.string().trim().max(50).allow('').optional(),
  clientPhone: Joi.string().trim().min(10).max(20).required(),
  service: Joi.string().trim().min(2).max(100).required(),
  area: Joi.string().trim().min(2).max(250).required(),
  address: Joi.string().trim().max(250).allow('').optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  budget: Joi.string().trim().max(50).allow('').optional()
}).min(1)), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.status !== 'قيد المراجعة' || order.assignedFanni || (Array.isArray(order.offers) && order.offers.length > 0)) {
      return res.status(409).json({ message: 'لا يمكن تصحيح الطلب بعد نشره أو ارتباطه بعروض أو فني. التصحيح متاح قبل النشر فقط.' });
    }
    const phone = normalizePhone(req.body.clientPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(400).json({ message: 'رقم تليفون العميل غير صحيح. أدخل رقم موبايل مصري مكوّنًا من 11 رقمًا.' });
    }
    order.clientName = String(req.body.clientName || '').trim() || 'عميل';
    order.clientPhone = phone;
    order.service = String(req.body.service || '').trim();
    order.area = String(req.body.area || '').trim();
    order.address = String(req.body.address || '').trim();
    order.description = String(req.body.description || '').trim();
    order.budget = String(req.body.budget || '').trim();
    await order.save();
    await writeAdminAudit(req, 'تصحيح بيانات طلب', 'orders', sn, JSON.stringify({ service: order.service, area: order.area }));
    return res.json({ message: 'تم حفظ تصحيح بيانات الطلب. راجع البيانات ثم انشره عند التأكد.', order });
  } catch (err) { next(err); }
});

router.post('/orders/:sn/cancel', auth('admin'), validate(Joi.object({
  reason: reasonSchema.optional()
})), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (['تم الانتهاء', 'منتهي', 'تم اختيار فني', 'مؤرشف', 'ملغي'].includes(order.status) || order.commissionCharged) {
      return res.status(409).json({ message: 'لا يمكن إلغاء طلب منتهي أو معيّن لفني أو سبق خصم عمولته أو ملغي أو مؤرشف' });
    }
    order.status = 'ملغي';
    order.adminActionNote = String(req.body.reason || 'إلغاء إداري').trim().slice(0, 500);
    order.adminActionAt = new Date();
    order.adminActionBy = adminName(req);
    await order.save();
    await writeAdminAudit(req, 'إلغاء طلب إداري', 'orders', sn, `reason=${order.adminActionNote}`);
    return res.json({ message: 'تم إلغاء الطلب', order: { sn: order.sn, status: order.status } });
  } catch (err) { next(err); }
});

router.post('/orders/:sn/archive', auth('admin'), validate(Joi.object({
  reason: reasonSchema.optional()
})), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (['قيد المراجعة', 'تم النشر', 'وصلتك عروض', 'تم اختيار فني'].includes(order.status)) {
      return res.status(409).json({ message: 'لا يمكن أرشفة طلب نشط؛ ألغِ الطلب أو أنهِه أولًا' });
    }
    if (order.status === 'مؤرشف') return res.status(409).json({ message: 'الطلب مؤرشف بالفعل' });
    order.status = 'مؤرشف';
    order.adminActionNote = String(req.body.reason || 'أرشفة إدارية').trim().slice(0, 500);
    order.adminActionAt = new Date();
    order.adminActionBy = adminName(req);
    await order.save();
    await writeAdminAudit(req, 'أرشفة طلب', 'orders', sn, `reason=${order.adminActionNote}`);
    return res.json({ message: 'تمت أرشفة الطلب', order: { sn: order.sn, status: order.status } });
  } catch (err) { next(err); }
});

router.post('/orders/bulk-delete', auth('admin'), validate(Joi.object({
  sns: Joi.array().items(Joi.string().trim().uppercase().pattern(/^SN\d{6}$/)).min(1).max(100).unique().required()
}).required()), async (req, res, next) => {
  try {
    const sns = req.body.sns;
    const found = await Order.find({ sn: { $in: sns } }).select('_id sn status offers assignedFanni commissionCharged').lean();
    const foundBySn = new Map(found.map(order => [String(order.sn).toUpperCase(), order]));
    const deletedSns = [];
    const skipped = [];
    for (const sn of sns) {
      const order = foundBySn.get(sn);
      if (!order) { skipped.push({ sn, reason: 'الطلب غير موجود أو تم حذفه مسبقًا' }); continue; }
      const protectedStatuses = ['تم النشر', 'وصلتك عروض', 'تم اختيار فني', 'تم الانتهاء', 'منتهي'];
      if (protectedStatuses.includes(order.status) || order.assignedFanni || order.commissionCharged === true || (Array.isArray(order.offers) && order.offers.length > 0)) {
        skipped.push({ sn, reason: 'طلب نشط أو مرتبط بعرض أو فني؛ لم يُحذف حفاظًا على السجل' }); continue;
      }
      const hasCommissionTransaction = await WalletTransaction.exists({ order: order._id, type: 'commission' });
      if (hasCommissionTransaction) { skipped.push({ sn, reason: 'مرتبط بحركة مالية؛ لم يُحذف' }); continue; }
      const deleted = await Order.deleteOne({
        _id: order._id, status: 'قيد المراجعة', commissionCharged: { $ne: true },
        assignedFanni: { $in: [null] },
        $or: [{ offers: { $exists: false } }, { offers: { $size: 0 } }]
      });
      if (deleted.deletedCount === 1) deletedSns.push(sn);
      else skipped.push({ sn, reason: 'تغيرت حالة الطلب أثناء العملية؛ لم يُحذف' });
    }
    const message = deletedSns.length
      ? 'تم حذف ' + deletedSns.length + ' طلبًا. ' + (skipped.length ? 'تم تجاوز ' + skipped.length + ' طلب/طلبات محمية أو غير متاحة.' : '')
      : 'لم يتم حذف أي طلب؛ كل العناصر المحددة محمية أو غير موجودة.';
    await writeAdminAudit(req, 'حذف جماعي لطلبات', 'orders', deletedSns.join(','), 'المحذوف: ' + deletedSns.join(',') + '؛ المتجاوز: ' + skipped.map(x => x.sn + ' (' + x.reason + ')').join('; '));
    return res.json({ message, deleted: deletedSns.length, deletedSns, skipped });
  } catch (err) { next(err); }
});

router.delete('/orders/:sn', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(sn)) { return res.status(400).json({ message: 'رقم الطلب غير صالح' }); }
    const order = await Order.findOne({ sn });
    if (!order) { return res.status(404).json({ message: 'الطلب غير موجود' }); }
    const hasCommissionTransaction = await WalletTransaction.exists({ order: order._id, type: 'commission' });
    const hasAssignedFanni = Boolean(order.assignedFanni);
    const hasOffers = Array.isArray(order.offers) && order.offers.length > 0;
    const hasCommission = order.commissionCharged === true || Boolean(hasCommissionTransaction);
    const protectedStatuses = ['تم اختيار فني', 'تم الانتهاء'];
    const hasProtectedStatus = protectedStatuses.includes(order.status);
    const summary = { status: String(order.status || ''), hasAssignedFanni, offersCount: Array.isArray(order.offers) ? order.offers.length : 0, commissionCharged: order.commissionCharged === true, hasCommissionTransaction: Boolean(hasCommissionTransaction), hasFinancialOrTechnicianLinks: hasAssignedFanni || hasOffers || hasCommission || hasProtectedStatus };
    const deleted = await Order.deleteOne({ _id: order._id });
    if (deleted.deletedCount !== 1) { return res.status(409).json({ message: 'لم يتم حذف الطلب. حدّث القائمة وحاول مرة أخرى.' }); }
    await writeAdminAudit(req, 'حذف طلب إداري', 'orders', String(order.sn), JSON.stringify(summary));
    return res.json({ message: summary.hasFinancialOrTechnicianLinks ? 'تم حذف الطلب بعد التأكيد. احتُفظ بسجلات الحركات المالية وطلبات الشحن.' : 'تم حذف الطلب بنجاح.', deleted: 1, sn: order.sn, summary });
  } catch (err) { next(err); }
});



router.post('/orders/:sn/assign', auth('admin'), async (req, res, next) => {
  let session;
  let committed = false;
  let notification = null;
  try {
    if (!requireRootAdmin(req, res)) return;
    const sn = String(req.params.sn || '').trim().toUpperCase();
    const offerId = String(req.body?.offerId || '');
    const reason = String(req.body?.reason || '').trim();
    if (!/^SN\d{6}$/.test(sn) || !mongoose.isValidObjectId(offerId)) return res.status(400).json({ message: 'كود الطلب أو العرض غير صحيح' });
    if (reason.length < 3 || reason.length > 500) return res.status(400).json({ message: 'سبب التعيين مطلوب من 3 إلى 500 حرف' });
    session = await mongoose.startSession();
    session.startTransaction();
    const order = await Order.findOne({ sn }).session(session);
    if (!order) { await session.abortTransaction(); return res.status(404).json({ message: 'الطلب غير موجود' }); }
    if (!['تم النشر', 'وصلتك عروض'].includes(order.status) || order.commissionCharged || (order.expiresAt && order.expiresAt <= new Date())) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'الطلب ليس متاحًا للتعيين أو انتهت مدته أو سبق خصم العمولة' });
    }
    const offer = order.offers.id(offerId);
    if (!offer || !offer.fanni) { await session.abortTransaction(); return res.status(404).json({ message: 'العرض أو حساب الفني غير موجود' }); }
    const price = Number(offer.priceNum);
    if (!Number.isFinite(price) || price <= 0) { await session.abortTransaction(); return res.status(400).json({ message: 'سعر العرض غير صالح' }); }
    const config = await AdminConfig.findOne({ key: 'main' }).select('pricing').session(session).lean();
    const pricing = config?.pricing || { commission: 10, minOffer: 1, maxOffer: 1000000 };
    if (price < Number(pricing.minOffer || 1) || price > Number(pricing.maxOffer || 1000000)) { await session.abortTransaction(); return res.status(409).json({ message: 'سعر العرض خارج الحدود الحالية' }); }
    const rate = Number(pricing.commission ?? 10);
    const commission = Math.round((price * rate / 100 + Number.EPSILON) * 100) / 100;
    const before = await Fanni.findOne({ _id: offer.fanni, role: 'fanni', status: 'معتمد', isFrozen: { $ne: true } }).session(session);
    if (!before) { await session.abortTransaction(); return res.status(409).json({ message: 'الفني غير معتمد أو محفظته مجمدة' }); }
    const balanceBefore = Number(before.walletBalance || 0);
    if (!Number.isFinite(balanceBefore) || balanceBefore < commission) { await session.abortTransaction(); return res.status(409).json({ message: 'رصيد محفظة الفني غير كافٍ للعمولة', requiredCommission: commission, walletBalance: balanceBefore || 0 }); }
    const after = await Fanni.findOneAndUpdate(
      { _id: before._id, role: 'fanni', status: 'معتمد', isFrozen: { $ne: true }, walletBalance: { $gte: commission } },
      { $inc: { walletBalance: -commission } }, { new: true, session, runValidators: true }
    );
    if (!after) { await session.abortTransaction(); return res.status(409).json({ message: 'الرصيد تغيّر؛ لم يتم التعيين أو الخصم' }); }
    const update = await Order.updateOne(
      { _id: order._id, status: { $in: ['تم النشر', 'وصلتك عروض'] }, commissionCharged: { $ne: true }, 'offers._id': offerId },
      { $set: { assignedFanni: before._id, assignedFanniName: offer.fanniName || before.name, acceptedOfferId: offer._id, acceptedOfferPrice: price, commissionRate: rate, commissionAmount: commission, commissionCharged: true, commissionChargedAt: new Date(), status: 'تم اختيار فني', adminActionNote: reason, adminActionAt: new Date(), adminActionBy: adminName(req) } },
      { session, runValidators: true }
    );
    if (update.modifiedCount !== 1) { await session.abortTransaction(); return res.status(409).json({ message: 'تغيرت حالة الطلب؛ لم يتم تثبيت الخصم' }); }
    await new WalletTransaction({
      fanni: before._id, order: order._id, orderSN: order.sn, type: 'commission', amount: -commission,
      balanceBefore, balanceAfter: Number(after.walletBalance),
      description: 'عمولة منصة صُنّاع للتعيين الإداري على الطلب ' + order.sn,
      idempotencyKey: 'commission:' + String(order._id)
    }).save({ session });
    await session.commitTransaction();
    committed = true;
    notification = { fanniId: before._id, clientId: order.clientAccount, sn: order.sn, name: before.name };
    await writeAdminAudit(req, 'تعيين فني وخصم العمولة', 'orders', sn, reason + '؛ الفني: ' + before.name + '؛ العمولة: ' + commission);
    return res.json({ message: 'تم تعيين الفني وتسجيل خصم العمولة', orderSN: sn, fanniName: before.name, commission: { rate, amount: commission } });
  } catch (err) {
    if (session && session.inTransaction()) { try { await session.abortTransaction(); } catch (_) {} }
    return next(err);
  } finally {
    if (session) await session.endSession();
    if (committed && notification) {
      try {
        await createNotification({ recipientRole: 'fanni', recipientId: notification.fanniId, type: 'admin_assignment', title: 'تم تعيينك على طلب', message: 'تم تعيينك على الطلب ' + notification.sn, link: '/fanni', dedupeKey: 'admin-assignment-fanni:' + notification.sn });
        if (notification.clientId) await createNotification({ recipientRole: 'client', recipientId: notification.clientId, type: 'technician_assigned', title: 'تم تعيين فني على طلبك', message: 'تم تعيين ' + notification.name + ' على الطلب ' + notification.sn, link: '/?tab=orders', dedupeKey: 'admin-assignment-client:' + notification.sn });
      } catch (notifyError) { console.error('Assignment notification failed:', notifyError.message); }
    }
  }
});


  return router;
}

module.exports = createAdminOrdersRouter;
