'use strict';

module.exports = function registerAdminOrdersAndAccounts(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

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

router.delete('/clients/:phone/account', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.params.phone || '').trim());
    if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح.' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'حساب العميل المسجل غير موجود.' });
    const activeOrder = await Order.exists({ clientPhone: phone, status: { $in: ['تم النشر', 'وصلتك عروض', 'تم اختيار فني'] } });
    if (activeOrder) return res.status(409).json({ message: 'لا يمكن حذف الحساب أثناء وجود طلب نشط. تم الحفاظ على الحساب وسجل الطلبات.' });
    await Client.deleteOne({ _id: client._id, phone });
    await writeAdminAudit(req, 'حذف حساب عميل', 'clients', phone, `clientId=${String(client._id)}; preservedOrderHistory=true`);
    return res.json({ message: 'تم حذف حساب العميل المسجل مع الحفاظ على سجل الطلبات التاريخي.' });
  } catch (err) { next(err); }
});

router.delete('/clients/:phone', auth('admin'), async (req, res, next) => {
  try {
    const rawPhone = String(req.params.phone || '').trim();
    const phone = normalizePhone(rawPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) { return res.status(400).json({ message: 'رقم هاتف العميل غير صالح. أدخل رقم موبايل مصري صحيحًا.' }); }
    const orders = await Order.find({ clientPhone: phone }).select('_id sn status assignedFanni commissionCharged').lean();
    if (orders.length === 0) { return res.status(404).json({ message: 'لا توجد طلبات مسجلة برقم الهاتف ده' }); }
    const orderIds = orders.map(order => order._id);
    const hasCommissionTransaction = await WalletTransaction.exists({ order: { $in: orderIds }, type: 'commission' });
    const protectedStatuses = ['تم اختيار فني', 'تم الانتهاء'];
    const hasProtectedOrder = orders.some(order => order.commissionCharged === true || Boolean(order.assignedFanni) || protectedStatuses.includes(order.status));
    if (hasProtectedOrder || hasCommissionTransaction) { return res.status(409).json({ message: 'لا يمكن حذف العميل لأن عنده طلبًا مرتبطًا بفني أو بعملية مالية. لم يتم حذف أي طلب.' }); }
    const result = await Order.deleteMany({ _id: { $in: orderIds }, clientPhone: phone, commissionCharged: { $ne: true }, assignedFanni: { $in: [null, undefined] }, status: { $nin: protectedStatuses } });
    if (result.deletedCount !== orders.length) { return res.status(409).json({ message: 'لم يتم حذف كل الطلبات المتوقعة؛ قد تكون بيانات تغيرت أثناء العملية. راجع الطلبات قبل إعادة المحاولة.', deleted: result.deletedCount }); }
    await writeAdminAudit(req, 'حذف طلبات عميل', 'clients', phone, `deletedOrders=${result.deletedCount}`);
    return res.json({ message: 'تم حذف طلبات العميل التجريبية بنجاح', deleted: result.deletedCount, phone });
  } catch (err) { next(err); }
});

router.delete('/fannis/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) { return res.status(404).json({ message: 'الفني غير موجود' }); }
    const fanniId = fanni._id;
    const [topupCount, pendingTopupCount, transactionCount, relatedOrderCount, activeOrderCount] = await Promise.all([
      TopupRequest.countDocuments({ fanni: fanniId }),
      TopupRequest.countDocuments({ fanni: fanniId, status: 'قيد المراجعة' }),
      WalletTransaction.countDocuments({ fanni: fanniId }),
      Order.countDocuments({ $or: [{ assignedFanni: fanniId }, { 'offers.fanni': fanniId }] }),
      Order.countDocuments({ status: { $in: ['قيد المراجعة', 'تم النشر', 'وصلتك عروض', 'تم اختيار فني'] }, $or: [{ assignedFanni: fanniId }, { 'offers.fanni': fanniId }] })
    ]);
    const summary = { balance: Number(fanni.walletBalance || 0), topupCount, pendingTopupCount, transactionCount, relatedOrderCount, activeOrderCount };
    const deleted = await Fanni.deleteOne({ _id: fanniId, role: 'fanni' });
    if (deleted.deletedCount !== 1) { return res.status(409).json({ message: 'لم يتم حذف حساب الفني. حدّث القائمة وحاول مرة أخرى.' }); }
    await writeAdminAudit(req, 'حذف حساب فني', 'fannis', String(fanniId), `name=${fanni.name}; balance=${summary.balance}; transactions=${summary.transactionCount}; orders=${summary.relatedOrderCount}`);
    return res.json({ message: 'تم حذف حساب الفني. احتُفظ بسجلات الطلبات والشحنات والحركات المالية.', deleted: 1, fanniId: String(fanniId), summary });
  } catch (err) { next(err); }
});

router.patch('/fannis/:id/level', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { level, reason } = req.body;
    if (!level || !VALID_LEVELS.includes(String(level).trim())) {
      return res.status(400).json({ message: 'المستوى غير صالح. القيم: ' + VALID_LEVELS.join(', ') });
    }
    const newLevel = String(level).trim();
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const oldLevel = fanni.level;
    if (oldLevel === newLevel) return res.json({ message: 'المستوى هو نفسه بالفعل', fanni: publicFanni(fanni) });
    fanni.level = newLevel;
    fanni.levelHistory.push({ from: oldLevel, to: newLevel, date: new Date(), by: adminName(req), byId: req.user?._id, reason: String(reason||'').slice(0,500) });
    fanni.decisions.push({ action: 'ترقية مستوى', reason: `من ${oldLevel} إلى ${newLevel}. ${String(reason||'').slice(0,400)}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { from: oldLevel, to: newLevel } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير مستوى فني', 'fannis', String(fanni._id), JSON.stringify({ from: oldLevel, to: newLevel, reason: String(reason || '').slice(0,400) }));
    return res.json({ message: `تمت ترقية المستوى من ${oldLevel} إلى ${newLevel}`, fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

router.patch('/fannis/:id/badge', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { badge, action } = req.body;
    if (!badge || !VALID_BADGES.includes(String(badge).trim())) {
      return res.status(400).json({ message: 'الشارة غير صالحة. القيم: ' + VALID_BADGES.join(', ') });
    }
    const b = String(badge).trim();
    const act = String(action||'add').trim(); // add | remove | toggle
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const hasBadge = Array.isArray(fanni.badges) && fanni.badges.includes(b);
    if (act === 'add' || act === '' || act === 'toggle' && !hasBadge) {
      if (hasBadge) return res.json({ message: 'الشارة موجودة بالفعل', fanni: publicFanni(fanni) });
      fanni.badges.push(b);
      if (!fanni.badgesGrantedAt) fanni.badgesGrantedAt = new Map();
      fanni.badgesGrantedAt.set(b, new Date());
      fanni.decisions.push({ action: 'إضافة شارة', reason: `إضافة شارة ${b}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { badge: b } });
    } else {
      if (!hasBadge) return res.json({ message: 'الشارة غير موجودة', fanni: publicFanni(fanni) });
      fanni.badges = fanni.badges.filter(x=>x!==b);
      if (fanni.badgesGrantedAt && fanni.badgesGrantedAt.delete) fanni.badgesGrantedAt.delete(b);
      fanni.decisions.push({ action: 'إزالة شارة', reason: `إزالة شارة ${b}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { badge: b } });
    }
    await fanni.save();
    await writeAdminAudit(req, hasBadge && !(act === 'add' || act === '' || act === 'toggle' && !hasBadge) ? 'إزالة شارة فني' : 'إضافة شارة فني', 'fannis', String(fanni._id), `badge=${b}; action=${act}`);
    return res.json({ message: act.includes('add') ? 'تمت إضافة الشارة' : 'تمت إزالة الشارة', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

router.patch('/fannis/:id/note', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { note } = req.body;
    const clean = String(note||'').trim().slice(0,2000);
    if (!clean) return res.status(400).json({ message: 'الملاحظة لا يمكن أن تكون فارغة' });
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    fanni.adminNote = clean;
    fanni.adminNotesHistory.push({ note: clean, date: new Date(), by: adminName(req), byId: req.user?._id });
    fanni.decisions.push({ action: 'تعديل ملاحظة', reason: clean.slice(0,500), date: new Date(), by: adminName(req), byId: req.user?._id });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل ملاحظة فني', 'fannis', String(fanni._id), `noteLength=${clean.length}`);
    return res.json({ message: 'تم حفظ الملاحظة الداخلية', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

router.patch('/fannis/:id/limit', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const { maxOrders, maxOffers, dailyLimit, isLimited, reason } = req.body;
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const limits = fanni.limits || {};
    if (maxOrders !== undefined) {
      const v = Number(maxOrders);
      if (!Number.isInteger(v) || v < 0 || v > 1000) return res.status(400).json({ message: 'maxOrders يجب أن يكون 0-1000' });
      limits.maxOrders = v;
    }
    if (maxOffers !== undefined) {
      const v = Number(maxOffers);
      if (!Number.isInteger(v) || v < 0 || v > 1000) return res.status(400).json({ message: 'maxOffers يجب أن يكون 0-1000' });
      limits.maxOffers = v;
    }
    if (dailyLimit !== undefined) {
      const v = Number(dailyLimit);
      if (!Number.isInteger(v) || v < 0 || v > 100) return res.status(400).json({ message: 'dailyLimit يجب أن يكون 0-100' });
      limits.dailyLimit = v;
    }
    if (isLimited !== undefined) {
      if (typeof isLimited !== 'boolean') return res.status(400).json({ message: 'isLimited يجب أن يكون Boolean' });
      limits.isLimited = isLimited;
    }
    if (reason !== undefined) limits.reason = String(reason).slice(0,500);
    fanni.limits = limits;
    fanni.decisions.push({ action: 'تعديل حد', reason: `حدود: ${JSON.stringify(limits)}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: limits });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل حدود استقبال فني', 'fannis', String(fanni._id), JSON.stringify(limits));
    return res.json({ message: 'تم حفظ حدود الاستقبال', fanni: publicFanni(fanni) });
  } catch(e){ next(e); }
});

router.patch('/fannis/:id/profile-controls', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({
      trustScore: Joi.number().integer().min(0).max(100).optional(),
      isVerified: Joi.boolean().optional(),
      isFeatured: Joi.boolean().optional(),
      featuredUntil: Joi.date().iso().allow(null).optional()
    }).min(1).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'إعدادات الثقة والظهور غير صحيحة' });
    const rawFeaturedUntil = req.body?.featuredUntil;
    const dateOnly = typeof rawFeaturedUntil === 'string' && rawFeaturedUntil.length === 10 && rawFeaturedUntil[4] === '-' && rawFeaturedUntil[7] === '-';
    const normalizedFeaturedUntil = dateOnly ? new Date(String(rawFeaturedUntil) + 'T23:59:59.999Z') : value.featuredUntil;
    if (value.isFeatured === true && normalizedFeaturedUntil && new Date(normalizedFeaturedUntil) <= new Date()) {
      return res.status(400).json({ message: 'تاريخ انتهاء التمييز يجب أن يكون اليوم أو تاريخًا مستقبليًا' });
    }
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const before = { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil };
    if (value.trustScore !== undefined) fanni.trustScore = value.trustScore;
    if (value.isVerified !== undefined) {
      fanni.isVerified = value.isVerified;
      const badges = new Set(Array.isArray(fanni.badges) ? fanni.badges : []);
      if (value.isVerified) badges.add('verified'); else badges.delete('verified');
      fanni.badges = Array.from(badges);
    }
    if (value.isFeatured !== undefined) fanni.isFeatured = value.isFeatured;
    if (Object.prototype.hasOwnProperty.call(value, 'featuredUntil')) fanni.featuredUntil = normalizedFeaturedUntil || undefined;
    if (fanni.isFeatured === false) fanni.featuredUntil = undefined;
    fanni.decisions.push({
      action: 'تعديل الثقة والظهور',
      reason: 'تحديث إعدادات الثقة والتحقق والتمييز من لوحة الإدارة',
      date: new Date(), by: adminName(req), byId: req.user?._id,
      meta: { before, after: { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil } }
    });
    await fanni.save();
    await writeAdminAudit(req, 'تعديل الثقة والظهور', 'fannis', String(fanni._id), JSON.stringify({ before, after: { trustScore: fanni.trustScore, isVerified: fanni.isVerified, isFeatured: fanni.isFeatured, featuredUntil: fanni.featuredUntil } }));
    return res.json({ message: 'تم حفظ درجة الثقة والتحقق والظهور', fanni: publicFanni(fanni) });
  } catch (error) { next(error); }
});

router.get('/orders/:sn/offers', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب يجب أن يكون SN + 6 أرقام' });
    const order = await Order.findOne({ sn }).populate('offers.fanni', 'name phone').lean();
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    return res.json({ sn: order.sn, status: order.status, offers: order.offers || [], count: (order.offers||[]).length });
  } catch(e){ next(e); }
});

router.delete('/offers/:sn/:idx', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    const idx = Number(req.params.idx);
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن حذف عرض بعد خصم العمولة' });
    if (['تم اختيار فني','تم الانتهاء'].includes(order.status)) return res.status(409).json({ message: 'الطلب في حالة محمية لا يمكن حذف عروضه' });
    if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
    const removed = order.offers[idx];
    order.offers.splice(idx,1);
    // لو العرض المحذوف هو المعين، الغي التعيين
    if (order.acceptedOfferId && String(order.acceptedOfferId) === String(removed._id)) {
      order.assignedFanni = null;
      order.assignedFanniName = '';
      order.acceptedOfferId = null;
      order.acceptedOfferPrice = null;
      if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
    }
    await order.save();
    await writeAdminAudit(req, 'حذف عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(removed.fanni || ''), price: removed.price, status: order.status }));
    return res.json({ message: 'تمت إزالة العرض', removed, offers: order.offers });
  } catch(e){ next(e); }
});

router.post('/offers/:sn/:idx/reject', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn||'').trim().toUpperCase();
    const idx = Number(req.params.idx);
    const reason = String(req.body.reason||'غير مناسب').slice(0,500);
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'رقم الطلب غير صالح' });
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'رقم العرض غير صالح' });
    const order = await Order.findOne({ sn });
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (order.commissionCharged) return res.status(409).json({ message: 'لا يمكن رفض عرض بعد خصم العمولة' });
    if (!Array.isArray(order.offers) || idx >= order.offers.length) return res.status(404).json({ message: 'العرض غير موجود' });
    const offer = order.offers[idx];
    // نعتبر الرفض = حذف مع تسجيل سبب في قرار لو الفني موجود
    if (offer.fanni) {
      const fanni = await Fanni.findById(offer.fanni);
      if (fanni) {
        fanni.decisions.push({ action: 'رفض', reason: `رفض عرض على ${sn}: ${reason}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sn, offerId: offer._id } });
        await fanni.save();
      }
    }
    order.offers.splice(idx,1);
    if (order.acceptedOfferId && String(order.acceptedOfferId) === String(offer._id)) {
      order.assignedFanni = null;
      order.acceptedOfferId = null;
      order.acceptedOfferPrice = null;
      if (order.status === 'تم اختيار فني') order.status = 'وصلتك عروض';
    }
    await order.save();
    await writeAdminAudit(req, 'رفض عرض فني', 'offers', `${sn}:${idx}`, JSON.stringify({ fanniId: String(offer.fanni || ''), price: offer.price, reason }));
    return res.json({ message: 'تم رفض العرض وإزالته', reason, offers: order.offers });
  } catch(e){ next(e); }
});
};
