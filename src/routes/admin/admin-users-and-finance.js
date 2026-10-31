'use strict';

module.exports = function registerAdminAdminUsersAndFinance(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

router.get('/me', auth('admin'), async (req, res) => {
  const role = isRootAdmin(req.user) ? 'أدمن رئيسي' : (req.user.adminRole || '');
  return res.set('Cache-Control', 'no-store').json({
    id: String(req.user._id),
    name: req.user.name,
    role: req.user.role,
    adminRole: req.user.adminRole || null,
    adminRoleLabel: role,
    adminPermissions: req.user.adminPermissions || {}
  });
});

router.get('/admin-users', auth('admin'), async (req, res, next) => {
  try {
    const users = await Fanni.find({ $or: [{ role: 'admin' }, { adminRole: { $in: ADMIN_ROLES } }] })
      .select('name phone role adminRole adminPermissions status').sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    return res.json({ users: users.map(publicAdminUser), data: users.map(publicAdminUser) });
  } catch (err) { next(err); }
});

router.post('/admin-users', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    const fanniId = String(req.body?.fanniId || '');
    const adminRole = String(req.body?.role || '');
    if (!validId(fanniId)) return sendBadId(res);
    if (!ADMIN_ROLES.includes(adminRole)) return res.status(400).json({ message: 'المنصب الإداري غير صالح' });
    const fanni = await Fanni.findOne({ _id: fanniId, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود' });
    if (fanni.status !== 'معتمد') return res.status(409).json({ message: 'لا يمكن ترقية فني غير معتمد أو موقوف' });
    if (fanni.adminRole === adminRole) return res.status(409).json({ message: 'الفني يشغل هذا المنصب بالفعل' });
    const previous = fanni.adminRole || '';
    fanni.adminRole = adminRole;
    fanni.decisions.push({ action: previous ? 'تغيير منصب إداري' : 'ترقية إداري', reason: previous ? `من ${previous} إلى ${adminRole}` : `تعيين ${adminRole}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous, newRole: adminRole } });
    await fanni.save();
    await writeAdminAudit(req, 'تعيين منصب إداري', 'admin-users', String(fanni._id), JSON.stringify({ name: fanni.name, previousRole: previous, newRole: adminRole }));
    return res.status(201).json({ message: `تم تعيين ${fanni.name} بمنصب ${adminRole} مع الاحتفاظ بحساب الفني`, user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});

router.patch('/admin-users/:id/role', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const adminRole = String(req.body?.role || '');
    if (!ADMIN_ROLES.includes(adminRole)) return res.status(400).json({ message: 'المنصب الإداري غير صالح' });
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || !((fanni.role === 'fanni' && fanni.adminRole) || fanni.role === 'admin')) return res.status(404).json({ message: 'المشرف غير موجود' });
    const previous = fanni.adminRole || 'مشرف';
    if (previous === adminRole && fanni.adminRole) return res.json({ message: 'المنصب لم يتغير', user: publicAdminUser(fanni) });
    fanni.adminRole = adminRole;
    fanni.decisions.push({ action: 'تغيير منصب إداري', reason: `من ${previous} إلى ${adminRole}`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous, newRole: adminRole } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير منصب إداري', 'admin-users', String(fanni._id), JSON.stringify({ previousRole: previous, newRole: adminRole }));
    return res.json({ message: `تم تغيير المنصب إلى ${adminRole}`, user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});

router.patch('/admin-users/:id/permissions', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const permissions = req.body?.permissions;
    const allowedSections = ['dashboard','fannis','orders','publishOrders','voiceReview','passwordRecovery','complaints','services','clients','topups','wallet','pricing','settings','content','support','regions','offers','notifications','clientsData'];
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ message: 'قائمة الصلاحيات غير صحيحة' });
    }
    const cleanInput = {};
    for (const key of allowedSections) {
      const item = permissions[key] || {};
      if (typeof item.read !== 'boolean' || typeof item.write !== 'boolean') {
        return res.status(400).json({ message: 'يجب تحديد القراءة والتنفيذ لكل قسم' });
      }
      cleanInput[key] = { read: item.read || item.write, write: item.write };
    }
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || (fanni.role !== 'admin' && (fanni.role !== 'fanni' || !ADMIN_ROLES.includes(fanni.adminRole)))) {
      return res.status(404).json({ message: 'حساب المشرف غير موجود' });
    }
    const role = fanni.adminRole || (fanni.role === 'admin' ? 'مشرف' : '');
    const defaults = defaultAdminPermissions(role);
    const overrides = { __customOverrides: true };
    for (const key of ADMIN_PERMISSION_KEYS) {
      const desired = cleanInput[key] || { read: false, write: false };
      const base = defaults[key] || { read: false, write: false };
      const delta = {};
      if (desired.read !== base.read) delta.read = desired.read;
      if (desired.write !== base.write) delta.write = desired.write;
      if (Object.keys(delta).length) overrides[key] = delta;
    }
    fanni.adminPermissions = overrides;
    const changedSections = Object.keys(overrides).filter(key => key !== '__customOverrides');
    fanni.decisions.push({ action: 'تغيير صلاحيات إدارية', reason: 'تحديث الاستثناءات الفردية فوق الصلاحيات الافتراضية للمنصب', date: new Date(), by: adminName(req), byId: req.user?._id, meta: { sections: changedSections } });
    await fanni.save();
    await writeAdminAudit(req, 'تغيير صلاحيات إدارية', 'admin-users', String(fanni._id), JSON.stringify({ role, changedSections }));
    return res.json({ message: 'تم حفظ الصلاحيات المخصصة بنجاح', user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});

router.delete('/admin-users/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!requireRootAdmin(req, res)) return;
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findById(req.params.id);
    if (!fanni || isRootAdmin(fanni) || !((fanni.role === 'fanni' && fanni.adminRole) || fanni.role === 'admin')) return res.status(404).json({ message: 'المشرف غير موجود' });
    const previous = fanni.adminRole || 'مشرف قديم';
    fanni.adminRole = null;
    // Legacy accounts whose role is still 'admin' must remain unable to enter
    // admin APIs after revocation; never convert them into technician accounts.
    if (fanni.role === 'admin') {
      fanni.adminPermissions = { __customOverrides: true, ...Object.fromEntries(ADMIN_PERMISSION_KEYS.map(key => [key, { read: false, write: false }])) };
    }
    fanni.decisions.push({ action: 'سحب صلاحية إدارية', reason: `سحب منصب ${previous} مع الاحتفاظ بالحساب`, date: new Date(), by: adminName(req), byId: req.user?._id, meta: { previousRole: previous } });
    await fanni.save();
    await writeAdminAudit(req, 'سحب صلاحية إدارية', 'admin-users', String(fanni._id), `previousRole=${previous}`);
    return res.json({ message: 'تم سحب الصلاحية الإدارية، وحساب الفني ما زال فعالًا', user: publicAdminUser(fanni) });
  } catch (err) { next(err); }
});

router.get('/audit-logs', auth('admin'), async (req, res, next) => {
  try {
    const query = {};
    if (req.query.date) {
      const date = new Date(String(req.query.date) + 'T00:00:00.000Z');
      if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'التاريخ غير صالح' });
      const end = new Date(date); end.setUTCDate(end.getUTCDate() + 1);
      query.createdAt = { $gte: date, $lt: end };
    }
    const logs = await AdminAuditLog.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return res.set('Cache-Control', 'no-store').json({ logs, items: logs });
  } catch (err) { next(err); }
});

router.get('/pricing', auth('admin'), async (req, res, next) => {
  try {
    const config = await getAdminConfig();
    return res.set('Cache-Control', 'no-store').json({ pricing: config.pricing, history: config.history.filter(x => x.key === 'pricing').slice(-100).reverse() });
  } catch (err) { next(err); }
});

router.put('/pricing', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      check: Joi.number().min(0).max(100000).required(),
      commission: Joi.number().min(0).max(100).required(),
      minOffer: Joi.number().integer().min(1).max(1000000).required(),
      maxOffer: Joi.number().integer().min(1).max(1000000).required()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'تحقق من رسوم الفرصة والعمولة والحدود السعرية' });
    if (value.minOffer > value.maxOffer) return res.status(400).json({ message: 'الحد الأدنى لا يمكن أن يكون أكبر من الحد الأقصى' });
    const config = await getAdminConfig();
    const before = config.pricing.toObject ? config.pricing.toObject() : { ...config.pricing };
    config.pricing = value;
    config.history.push({ key: 'pricing', before, after: value, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل الأسعار من لوحة الإدارة', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'تعديل الأسعار والعمولات', 'pricing', 'pricing', JSON.stringify({ before, after: value }));
    return res.json({ message: 'تم حفظ الأسعار وسجل التغيير', pricing: config.pricing, history: config.history.filter(x => x.key === 'pricing').slice(-100).reverse() });
  } catch (err) { next(err); }
});

router.post('/orders/:sn/assign', auth('admin'), async (req, res, next) => {
  let session;
  let committed = false;
  let notification = null;
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'تعيين الفني وخصم العمولة إجراء مالي متاح للمدير العام فقط' });
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

router.get('/wallet/transactions/:fanniId', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.fanniId)) return sendBadId(res);
    const list = await WalletTransaction.find({fanni:req.params.fanniId}).sort({createdAt:-1}).limit(100).lean();
    return res.json({transactions:list, data:list});
  }catch(e){next(e);}
});

router.post('/wallet/freeze/:id', auth('admin'), async (req,res,next)=>{
  try{
    if(!validId(req.params.id)) return sendBadId(res);
    const { reason, action } = req.body;
    const act = String(action||'freeze').toLowerCase();
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni) return res.status(404).json({ message: 'الفني غير موجود' });
    const r = String(reason||'').slice(0,500);
    if (act === 'freeze') {
      if (fanni.isFrozen) return res.json({ message: 'المحفظة مجمدة بالفعل', fanni: publicFanni(fanni) });
      fanni.isFrozen = true;
      fanni.frozenAt = new Date();
      fanni.frozenReason = r;
      fanni.frozenBy = adminName(req);
      fanni.decisions.push({ action: 'تجميد محفظة', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    } else {
      if (!fanni.isFrozen) return res.json({ message: 'المحفظة غير مجمدة', fanni: publicFanni(fanni) });
      fanni.isFrozen = false;
      fanni.frozenAt = undefined;
      fanni.frozenReason = undefined;
      fanni.frozenBy = undefined;
      fanni.decisions.push({ action: 'إلغاء تجميد', reason: r, date: new Date(), by: adminName(req), byId: req.user?._id });
    }
    await fanni.save();
    await writeAdminAudit(req, act === 'freeze' ? 'تجميد محفظة فني' : 'إلغاء تجميد محفظة فني', 'wallet', String(fanni._id), `name=${fanni.name}; reason=${r}`);
    return res.json({ message: act==='freeze' ? 'تم تجميد المحفظة' : 'تم إلغاء تجميد المحفظة', fanni: publicFanni(fanni) });
  }catch(e){next(e);}
});

router.post('/clients/:phone/block', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح' });
    const schema = Joi.object({ reason: Joi.string().trim().min(2).max(500).required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) return res.status(400).json({ message: 'اكتب سبب الحظر من حرفين إلى 500 حرف' });
    const client = await Client.findOne({ phone });
    if (!client) return res.status(404).json({ message: 'لا يوجد حساب عميل مسجل بهذا الرقم. الطلبات المنشأة دون حساب لا يمكن حظرها من هذه الخاصية.' });
    if (client.status === 'معلق') return res.json({ message: 'حساب العميل معلق بالفعل', client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
    client.status = 'معلق';
    await client.save();
    await writeAdminAudit(req, 'حظر حساب عميل', 'clients', phone, `clientId=${String(client._id)}; reason=${value.reason}`);
    return res.json({ message: 'تم تعليق حساب العميل ومنعه من تسجيل الدخول واستخدام المسارات المحمية. سبب الإجراء: ' + value.reason, client: { id: String(client._id), name: client.name, phone: client.phone, status: client.status } });
  } catch (error) { return next(error); }
});
};
