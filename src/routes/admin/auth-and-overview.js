'use strict';

module.exports = function registerAdminAuthAndOverview(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

router.post('/bootstrap', async (req, res, next) => {
  try {
    const configuredSecret = String(process.env.ADMIN_SETUP_SECRET || '');
    const suppliedSecret = typeof req.body?.secret === 'string' ? req.body.secret : '';
    if (configuredSecret.length < 32 || suppliedSecret.length < 32) {
      return res.status(503).json({ message: 'إعداد إنشاء حساب الإدارة غير مكتمل' });
    }
    const expected = Buffer.from(configuredSecret, 'utf8');
    const supplied = Buffer.from(suppliedSecret, 'utf8');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ message: 'المفتاح السري غير صحيح' });
    }
    const adminCount = await Fanni.countDocuments({ role: 'admin' });
    if (adminCount > 0) {
      return res.status(409).json({ message: 'يوجد حساب إدارة بالفعل. تم إيقاف إنشاء الحساب الأول.' });
    }
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPhone = String(process.env.ADMIN_PHONE || '').trim();
    const password = String(process.env.ADMIN_PASSWORD || '');
    const name = String(process.env.ADMIN_NAME || 'إدارة صناع').trim();
    if (!email || !Joi.string().email().validate(email).value || !configuredPhone || password.length < 12 || name.length < 2 || name.length > 50) {
      return res.status(503).json({ message: 'راجع إعدادات ADMIN_EMAIL وADMIN_PHONE وADMIN_PASSWORD وADMIN_NAME على الخادم' });
    }
    const phone = normalizePhone(configuredPhone);
    if (!phone || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(503).json({ message: 'رقم الإدارة الموجود في إعدادات الخادم غير صالح' });
    }
    const existingPhone = await Fanni.findOne({ phone }).select('_id');
    if (existingPhone) {
      return res.status(409).json({ message: 'رقم الإدارة مستخدم بالفعل في حساب موجود. لم يتم تغيير أي حساب.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'إعداد JWT_SECRET غير موجود على الخادم' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Fanni.create({
      name, phone, passwordHash, specialties: ['إدارة'], areas: ['الإدارة'], status: 'معتمد', role: 'admin',
      decisions: [{ action: 'تسجيل', reason: 'إنشاء أول حساب إدارة', date: new Date(), by: 'النظام' }]
    });
    return res.status(201).json({
      message: 'تم إنشاء أول حساب إدارة بنجاح. احتفظ ببيانات الدخول في مكان آمن.',
      user: { id: String(admin._id), name: admin.name, phone: admin.phone, role: admin.role }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'الحساب أو رقم الهاتف موجود بالفعل. لم يتم إنشاء حساب مكرر.' });
    }
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'تسجيل الدخول غير متاح بسبب إعدادات الخادم' });
    }
    const phone = getLoginPhone(req.body);
    if (!phone) { return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' }); }
    const admin = await Fanni.findOne({ phone, $or: [{ role: 'admin' }, { adminRole: { $in: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'] } }] }).select('+passwordHash');
    if (!admin || !admin.passwordHash || !(await bcrypt.compare(req.body.password, admin.passwordHash))) {
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }
    if (admin.status === 'معلق' || admin.status === 'مرفوض') {
      return res.status(403).json({ message: 'حساب الإدارة غير مسموح له بالدخول' });
    }
    const token = jwt.sign({ id: admin._id, role: admin.role, adminRole: admin.adminRole || null, tokenVersion: Number(admin.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: ADMIN_TOKEN_EXPIRY });
    return res.json({ token, user: { id: String(admin._id), name: admin.name, phone: admin.phone, role: admin.role, adminRole: admin.adminRole || null } });
  } catch (err) { next(err); }
});

router.get('/complaints', auth('admin'), async (req, res, next) => {
  try {
    const filter = {};
    const status = String(req.query.status || '').trim();
    if (status) {
      const { error } = complaintStatusSchema.validate(status);
      if (error) { return res.status(400).json({ message: 'حالة الشكوى المطلوبة غير صحيحة' }); }
      filter.status = status;
    }
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIST_LIMIT) : MAX_LIST_LIMIT;
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ complaints, data: complaints, total: complaints.length });
  } catch (err) { next(err); }
});

router.get('/complaints/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const complaint = await Complaint.findById(req.params.id).lean();
    if (!complaint) { return res.status(404).json({ message: 'الشكوى غير موجودة' }); }
    return res.json({ complaint, data: complaint });
  } catch (err) { next(err); }
});

router.patch('/complaints/:id', auth('admin'), validate(Joi.object({
  status: complaintStatusSchema.optional(),
  adminNote: Joi.string().trim().max(1000).allow('').optional(),
  adminResponse: Joi.string().trim().max(1000).allow('').optional()
}).min(1)), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) { return sendBadId(res); }
    const updates = {};
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
    if (hasStatus) { updates.status = req.body.status; }
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminNote')) { updates.adminNote = req.body.adminNote; }
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminResponse')) { updates.adminResponse = req.body.adminResponse; }
    if (hasStatus) { updates.reviewedAt = new Date(); updates.reviewedBy = adminName(req); }
    updates.updatedAt = new Date();
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!complaint) { return res.status(404).json({ message: 'الشكوى غير موجودة' }); }
    await writeAdminAudit(req, 'تحديث شكوى', 'complaints', String(complaint._id), JSON.stringify({ sn: complaint.sn, status: complaint.status, statusChanged: hasStatus, hasAdminResponse: Boolean(complaint.adminResponse) }));
    if (complaint.adminResponse && String(complaint.adminResponse).trim()) {
      const order = await Order.findOne({ sn: complaint.sn }).select('_id clientAccount').lean();
      if (order?.clientAccount) await createNotification({
        recipientRole: 'client', recipientId: order.clientAccount, type: 'complaint_reply',
        title: 'تم الرد على شكواك', message: 'الإدارة ردت على الشكوى الخاصة بالطلب ' + complaint.sn + '.',
        link: '/?tab=complaint', dedupeKey: 'complaint-reply:' + String(complaint._id) + ':' + String(complaint.updatedAt || Date.now())
      });
    }
    return res.json({ message: 'تم تحديث الشكوى بنجاح', complaint, data: complaint });
  } catch (err) { next(err); }
});

router.get('/counts', auth('admin'), async (req, res, next) => {
  try {
    const legacyFanniFilter = { $or: [ { role: 'fanni' }, { role: { $ne: 'admin' }, specialties: { $exists: true, $ne: [] }, adminRole: null } ] };
    const [technicians, verifiedTechnicians, clients] = await Promise.all([
      Fanni.countDocuments(legacyFanniFilter),
      Fanni.countDocuments({ ...legacyFanniFilter, status: 'معتمد' }),
      Client.countDocuments({})
    ]);
    return res.set('Cache-Control', 'no-store').json({
      counts: { technicians, verifiedTechnicians, clients }
    });
  } catch (err) { next(err); }
});

router.patch('/fannis/:id/password', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const schema = Joi.object({ newPassword: Joi.string().min(8).max(128).required(), confirmPassword: Joi.string().required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error || value.newPassword !== value.confirmPassword) return res.status(400).json({ message: 'كلمة السر يجب ألا تقل عن 8 أحرف، والتأكيد يجب أن يطابقها.' });
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).select('+passwordHash');
    if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });
    fanni.passwordHash = await bcrypt.hash(value.newPassword, 12);
    fanni.tokenVersion = Number(fanni.tokenVersion || 0) + 1;
    await fanni.save();
    await writeAdminAudit(req, 'تغيير كلمة سر فني', 'fannis', String(fanni._id), 'تغيير كلمة سر الحساب من لوحة الإدارة دون تسجيل كلمة السر');
    return res.json({ message: 'تم تغيير كلمة سر الفني بنجاح.' });
  } catch (err) { next(err); }
});

router.get('/fannis', auth('admin'), async (req, res, next) => {
  try {
    const list = await Fanni.find({ $or: [ { role: 'fanni' }, { role: { $ne: 'admin' }, specialties: { $exists: true, $ne: [] }, adminRole: null } ] }).select('-passwordHash').sort({ createdAt: -1 }).limit(MAX_LIST_LIMIT).lean();
    const ids = list.map(item => item._id);
    const [ratingStats, completedStats] = ids.length ? await Promise.all([
      Rating.aggregate([
        { $match: { fanniId: { $in: ids }, reviewerRole: 'client' } },
        { $group: { _id: '$fanniId', average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { assignedFanni: { $in: ids }, status: 'تم الانتهاء' } },
        { $group: { _id: '$assignedFanni', count: { $sum: 1 } } }
      ])
    ]) : [[], []];
    const ratingsById = new Map(ratingStats.map(item => [String(item._id), item]));
    const completedById = new Map(completedStats.map(item => [String(item._id), item.count]));
    const fannis = list.map(item => {
      const result = publicFanni(item);
      const rating = ratingsById.get(String(item._id));
      result.ratingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
      result.ratingCount = rating?.count || 0;
      result.completedJobs = completedById.get(String(item._id)) || 0;
      return result;
    });
    return res.set('Cache-Control', 'no-store').json({ fannis, data: fannis });
  } catch (err) { next(err); }
});

router.get('/fanni-profile-edits', auth('admin'), async (req, res, next) => {
  try {
    const fannis = await Fanni.find({ role: 'fanni', 'pendingProfileChange.requestedAt': { $exists: true, $ne: null } }).select('-passwordHash').sort({ 'pendingProfileChange.requestedAt': 1 }).limit(MAX_LIST_LIMIT).lean();
    return res.set('Cache-Control', 'no-store').json({ requests: fannis.map(item => ({ _id: item._id, name: item.name, phone: item.phone, specialties: item.specialties || [], areas: item.areas || [], pendingProfileChange: item.pendingProfileChange, status: item.status, createdAt: item.createdAt })) });
  } catch (err) { next(err); }
});

router.post('/fanni-profile-edits/:id/approve', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni || !fanni.pendingProfileChange?.requestedAt) return res.status(404).json({ message: 'طلب تعديل البيانات غير موجود أو تمت مراجعته بالفعل' });
    const pending = fanni.pendingProfileChange;
    const duplicate = await Fanni.findOne({ phone: pending.phone, _id: { $ne: fanni._id } }).select('_id');
    if (duplicate) return res.status(409).json({ message: 'رقم الهاتف المطلوب أصبح مسجلًا في حساب آخر. ارفض الطلب واطلب من الفني رقمًا آخر.' });
    const before = { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas };
    fanni.phone = pending.phone; fanni.specialties = pending.specialties; fanni.areas = pending.areas;
    fanni.pendingProfileChange = undefined;
    fanni.decisions.push(decision(req, 'اعتماد تعديل بيانات', 'اعتماد طلب تعديل بيانات الفني'));
    fanni.decisions[fanni.decisions.length - 1].meta = { before, after: { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas } };
    await fanni.save();
    await writeAdminAudit(req, 'اعتماد تعديل بيانات فني', 'fannis', String(fanni._id), JSON.stringify({ before, after: { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas } }));
    await createNotification({ recipientRole: 'fanni', recipientId: fanni._id, type: 'profile_change_approved', title: 'تمت الموافقة على تعديل بياناتك', message: 'وافقت الإدارة على طلب تعديل بيانات حسابك وتم تحديث البيانات.', link: '/fanni', dedupeKey: 'profile-change-approved:' + String(fanni._id) + ':' + Date.now() });
    return res.json({ message: 'تم اعتماد تعديل بيانات الفني بنجاح', fanni: publicFanni(fanni) });
  } catch (err) { next(err); }
});

router.post('/fanni-profile-edits/:id/reject', auth('admin'), validate(Joi.object({ reason: reasonSchema.optional() })), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
    if (!fanni || !fanni.pendingProfileChange?.requestedAt) return res.status(404).json({ message: 'طلب تعديل البيانات غير موجود أو تمت مراجعته بالفعل' });
    const reason = String(req.body.reason || 'لم تتم الموافقة على الطلب').trim().slice(0, 500);
    fanni.pendingProfileChange = undefined;
    fanni.decisions.push(decision(req, 'رفض تعديل بيانات', reason));
    await fanni.save();
    await writeAdminAudit(req, 'رفض تعديل بيانات فني', 'fannis', String(fanni._id), `reason=${reason}`);
    await createNotification({ recipientRole: 'fanni', recipientId: fanni._id, type: 'profile_change_rejected', title: 'لم تتم الموافقة على تعديل بياناتك', message: 'رفضت الإدارة طلب تعديل البيانات. السبب: ' + reason, link: '/fanni', dedupeKey: 'profile-change-rejected:' + String(fanni._id) + ':' + Date.now() });
    return res.json({ message: 'تم رفض طلب تعديل البيانات وإبقاء البيانات الأصلية كما هي' });
  } catch (err) { next(err); }
});

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
};
