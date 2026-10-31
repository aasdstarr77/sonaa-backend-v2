'use strict';

module.exports = function registerAdminSettingsAndSupport(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

router.patch('/content/announcement', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({ announcement: Joi.string().trim().max(1000).allow('').required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'نص الإعلان غير صالح؛ الحد الأقصى 1000 حرف' });
    const config = await getAdminConfig();
    const previousLength = String(config.content?.announcement || '').length;
    const faqCount = Array.isArray(config.content?.faqs) ? config.content.faqs.length : 0;
    // Update only the announcement path so unrelated legacy FAQ records are not revalidated.
    config.set('content.announcement', value.announcement);
    config.history.push({
      key: 'content',
      before: { announcementLength: previousLength, faqCount },
      after: { announcementLength: value.announcement.length, faqCount },
      by: adminName(req), byId: String(req.user?._id || ''),
      reason: value.announcement ? 'تعديل الإعلان فقط' : 'مسح الإعلان',
      createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, value.announcement ? 'تعديل الإعلان' : 'مسح الإعلان', 'content', 'announcement', 'تم تحديث الإعلان دون تغيير الأسئلة الشائعة');
    return res.json({ message: value.announcement ? 'تم حفظ الإعلان ونشره لواجهة العميل.' : 'تم مسح الإعلان ونشر التغيير لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});

router.put('/content', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      announcement: Joi.string().trim().max(1000).allow('').required(),
      faqs: Joi.array().max(100).items(Joi.object({
        question: Joi.string().trim().min(2).max(250).required(),
        answer: Joi.string().trim().min(2).max(1000).required(),
        active: Joi.boolean().default(true)
      }).required()).required()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'نص الإعلان أو الأسئلة الشائعة غير صالح' });
    const config = await getAdminConfig();
    const before = config.content.toObject ? config.content.toObject() : { ...config.content };
    config.content = value;
    config.history.push({ key: 'content', before: { announcementLength: String(before.announcement || '').length, faqCount: Array.isArray(before.faqs) ? before.faqs.length : 0 }, after: { announcementLength: String(value.announcement || '').length, faqCount: value.faqs.length }, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل محتوى الواجهة', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'تعديل محتوى الواجهة', 'content', 'content', 'تم حفظ الإعلان والأسئلة الشائعة');
    return res.json({ message: 'تم حفظ المحتوى ونشره لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});

router.get('/support/search', auth('admin'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.status(400).json({ message: 'اكتب رقم طلب أو هاتفًا أو كود تتبع من حرفين على الأقل' });
    const literal = q.replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/\s+/g, ' ');
    if (literal.length < 2) return res.status(400).json({ message: 'نص البحث غير صالح' });
    const rx = new RegExp(literal, 'i');
    const [orders, complaints] = await Promise.all([
      Order.find({ $or: [{ sn: rx }, { clientPhone: rx }, { clientName: rx }] }).select('sn service status clientName clientPhone area adminActionNote createdAt').sort({ createdAt: -1 }).limit(30).lean(),
      Complaint.find({ $or: [{ sn: rx }, { clientName: rx }, { text: rx }] }).sort({ createdAt: -1 }).limit(30).lean()
    ]);
    return res.json({ orders, complaints });
  } catch (err) { next(err); }
});

router.post('/support/:sn/review', auth('admin'), async (req, res, next) => {
  try {
    const sn = String(req.params.sn || '').trim().toUpperCase();
    if (!/^SN\d{6}$/.test(sn)) return res.status(400).json({ message: 'كود الطلب غير صالح؛ استخدم SN متبوعًا بستة أرقام' });
    const complaint = await Complaint.findOne({ sn }).sort({ createdAt: -1 });
    if (complaint) { complaint.status = 'قيد المراجعة'; complaint.reviewedAt = new Date(); complaint.reviewedBy = adminName(req); await complaint.save(); }
    else { const order = await Order.findOne({ sn }); if (!order) return res.status(404).json({ message: 'لا يوجد طلب أو شكوى بهذا الكود' }); order.adminActionNote = 'تم وضع علامة مراجعة من أدوات الدعم'; order.adminActionAt = new Date(); order.adminActionBy = adminName(req); await order.save(); }
    await writeAdminAudit(req, 'وضع علامة مراجعة', 'support', sn, 'مراجعة من أدوات الدعم');
    return res.json({ message: 'تم وضع علامة المراجعة', sn });
  } catch (err) { next(err); }
});

router.get('/support/violations', auth('admin'), async (req, res, next) => {
  try { const logs = await AdminAuditLog.find({ category: 'support' }).sort({ createdAt: -1 }).limit(200).lean(); return res.json({ violations: logs, items: logs }); }
  catch (err) { next(err); }
});

router.patch('/clients/:phone/password', auth('admin'), async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.params.phone || '').trim());
    if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم هاتف العميل غير صالح.' });
    const schema = Joi.object({ newPassword: Joi.string().min(8).max(128).required(), confirmPassword: Joi.string().required() }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error || value.newPassword !== value.confirmPassword) return res.status(400).json({ message: 'كلمة السر يجب ألا تقل عن 8 أحرف، والتأكيد يجب أن يطابقها.' });
    const client = await Client.findOne({ phone }).select('+passwordHash');
    if (!client) return res.status(404).json({ message: 'حساب العميل المسجل غير موجود.' });
    client.passwordHash = await bcrypt.hash(value.newPassword, 12);
    await client.save();
    await writeAdminAudit(req, 'تغيير كلمة سر عميل', 'clients', phone, 'تغيير كلمة سر الحساب من لوحة الإدارة دون تسجيل كلمة السر');
    return res.json({ message: 'تم تغيير كلمة سر العميل بنجاح.' });
  } catch (err) { next(err); }
});

router.get('/clients', auth('admin'), async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim().slice(0, 100);
    const literal = q.replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/\s+/g, ' ');
    const rx = literal.length >= 2 ? new RegExp(literal, 'i') : null;
    const registered = await Client.find(rx ? { $or: [{ name: rx }, { phone: rx }] } : {}).select('name phone status adminNote createdAt').sort({ createdAt: -1 }).limit(200).lean();
    const orders = await Order.find(rx ? { $or: [{ clientName: rx }, { clientPhone: rx }, { sn: rx }] } : {}).select('clientName clientPhone sn createdAt').sort({ createdAt: -1 }).limit(500).lean();
    const byPhone = new Map();
    for (const order of orders) { const phone = String(order.clientPhone || ''); if (!phone) continue; const item = byPhone.get(phone) || { name: order.clientName || 'عميل', phone, status: 'غير مسجل', orderCount: 0, lastOrder: '' }; item.orderCount++; if (!item.lastOrder) item.lastOrder = order.sn || ''; byPhone.set(phone, item); }
    for (const client of registered) { const item = byPhone.get(client.phone) || { name: client.name, phone: client.phone, orderCount: 0, lastOrder: '' }; Object.assign(item, { name: client.name, status: client.status, adminNote: client.adminNote || '', registered: true }); byPhone.set(client.phone, item); }
    const clients = Array.from(byPhone.values()).sort((a,b) => (b.orderCount || 0) - (a.orderCount || 0)).slice(0, 200);
    const phones = clients.map(client => normalizePhone(client.phone || '')).filter(Boolean);
    const [ratingStats, completedStats] = phones.length ? await Promise.all([
      Rating.aggregate([
        { $match: { clientPhone: { $in: phones }, reviewerRole: 'fanni' } },
        { $group: { _id: '$clientPhone', average: { $avg: '$stars' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { clientPhone: { $in: phones }, status: 'تم الانتهاء' } },
        { $group: { _id: '$clientPhone', count: { $sum: 1 } } }
      ])
    ]) : [[], []];
    const ratingsByPhone = new Map(ratingStats.map(item => [normalizePhone(item._id || ''), item]));
    const completedByPhone = new Map(completedStats.map(item => [normalizePhone(item._id || ''), item.count]));
    for (const client of clients) {
      const phone = normalizePhone(client.phone || '');
      const rating = ratingsByPhone.get(phone);
      client.ratingAverage = rating ? Math.round(rating.average * 100) / 100 : 0;
      client.ratingCount = rating?.count || 0;
      client.completedJobs = completedByPhone.get(phone) || 0;
    }
    return res.set('Cache-Control', 'no-store').json({ clients, items: clients });
  } catch (err) { next(err); }
});

router.post('/reports', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      startDate: Joi.string().isoDate().allow('').optional(),
      endDate: Joi.string().isoDate().allow('').optional(),
      service: Joi.string().trim().max(100).allow('').optional(),
      area: Joi.string().trim().max(250).allow('').optional()
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'فلاتر التقرير غير صحيحة', details: error.details.map(item => item.message) });
    const filter = {};
    if (value.startDate || value.endDate) {
      filter.createdAt = {};
      if (value.startDate) filter.createdAt.$gte = new Date(value.startDate + 'T00:00:00.000Z');
      if (value.endDate) {
        const end = new Date(value.endDate + 'T00:00:00.000Z');
        end.setUTCDate(end.getUTCDate() + 1);
        filter.createdAt.$lt = end;
      }
      if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) {
        return res.status(400).json({ message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له' });
      }
    }
    if (value.service) filter.service = value.service;
    if (value.area) filter.area = value.area;

    const [totalOrders, completedOrders, cancelledOrders, pendingOrders, publishedOrders, topServices, approvedTechnicians, activeClients] = await Promise.all([
      Order.countDocuments(filter),
      Order.countDocuments({ ...filter, status: { $in: ['تم الانتهاء', 'منتهي'] } }),
      Order.countDocuments({ ...filter, status: { $in: ['ملغي', 'منتهي - اعتذار', 'اعتذار'] } }),
      Order.countDocuments({ ...filter, status: 'قيد المراجعة' }),
      Order.countDocuments({ ...filter, status: { $in: ['تم النشر', 'وصلتك عروض'] } }),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 }
      ]),
      Fanni.countDocuments({ role: 'fanni', status: 'معتمد' }),
      Client.countDocuments({ status: 'نشط' })
    ]);
    return res.set('Cache-Control', 'no-store').json({
      message: 'تم إنشاء التقرير من بيانات قاعدة البيانات',
      generatedAt: new Date(),
      filters: { startDate: value.startDate || '', endDate: value.endDate || '', service: value.service || '', area: value.area || '' },
      summary: { totalOrders, completedOrders, cancelledOrders, pendingOrders, publishedOrders, approvedTechnicians, activeClients },
      topServices: topServices.map(item => ({ service: item._id || 'غير محدد', count: item.count }))
    });
  } catch (error) { return next(error); }
});

router.get('/services', auth('admin'), async (req, res, next) => {
  try {
    const savedServices = await Service.find({}).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
    const visibleServices = savedServices.filter(item => !isBrokenWallScreenService(item.name));
    const map = buildAdminCategoriesMap(visibleServices);
    const categoriesDetailed = Array.from(map.values()).map(cat => ({
      label: cat.label,
      name: cat.label,
      emoji: cat.emoji,
      categorySortOrder: cat.categorySortOrder,
      services: cat.services.map(s => s.name),
      _displayServices: cat.services.map(s => s.name),
      _detailed: cat.services,
      count: cat.services.length,
      activeCount: cat.services.filter(s => s.isActive).length
    }));
    const allFlat = [];
    for (const cat of map.values()) {
      for (const s of cat.services) allFlat.push(s);
    }
    return res.json({
      ok: true,
      categories: categoriesDetailed,
      services: allFlat,
      data: categoriesDetailed,
      legacyCategories: CATEGORIES
    });
  } catch (e) { next(e); }
});

router.post('/services', auth('admin'), async (req, res, next) => {
  try {
    let { name, category, emoji, sortOrder } = req.body;

    const nameErr = validateNameField(name || '');
    if (nameErr) return res.status(400).json({ message: nameErr });
    name = String(name).trim().replace(/\s+/g, ' ');
    if (isBrokenWallScreenService(name)) return res.status(400).json({ message: 'الخدمة دي محذوفة نهائيًا ولا يمكن إضافتها مرة أخرى' });

    if (!category || !String(category).trim()) {
      const found = findCategoryByService(name);
      category = found ? found.label : 'خدمات أخرى';
    }
    const catErr = validateCategoryField(category);
    if (catErr) return res.status(400).json({ message: catErr });
    category = String(category).trim().replace(/\s+/g, ' ');

    const sortErr = validateSortOrder(sortOrder);
    if (sortErr) return res.status(400).json({ message: sortErr });

    if (emoji !== undefined && emoji !== null && emoji !== '') {
      if (typeof emoji !== 'string' || emoji.trim().length > 10) {
        return res.status(400).json({ message: 'الرمز التعبيري غير صالح' });
      }
    }

    const payload = {
      name,
      category,
      emoji: emoji ? String(emoji).trim() : (findCategoryByLabel(category)?.emoji || findCategoryByService(name)?.emoji || '🔧'),
      sortOrder: sortOrder !== undefined && sortOrder !== '' ? Number(sortOrder) : 0,
      categorySortOrder: (findCategoryByLabel(category) ? (CATEGORIES.findIndex(c => normalizeForCompare(c.label) === normalizeForCompare(category)) + 1) * 10 : 100000),
      isActive: true
    };

    const existingInCategory = (await Service.find({ category }).select('+normalizedName')).find(item =>
      normalizeForCompare(item.name) === normalizeForCompare(name)
    );
    if (existingInCategory) {
      if (existingInCategory.isActive) return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
      existingInCategory.name = name;
      existingInCategory.category = category;
      existingInCategory.emoji = payload.emoji;
      existingInCategory.sortOrder = payload.sortOrder;
      existingInCategory.categorySortOrder = payload.categorySortOrder;
      existingInCategory.isActive = true;
      await existingInCategory.save();
      await writeAdminAudit(req, 'إعادة تفعيل خدمة', 'services', String(existingInCategory._id), JSON.stringify({ name: existingInCategory.name, category: existingInCategory.category }));
      return res.json({ ok: true, message: 'تمت إعادة إضافة الخدمة', service: existingInCategory, data: existingInCategory });
    }
    const service = await Service.create(payload);
    await writeAdminAudit(req, 'إضافة خدمة', 'services', String(service._id), JSON.stringify({ name: service.name, category: service.category, sortOrder: service.sortOrder }));
    return res.status(201).json({ ok: true, message: 'تمت إضافة الخدمة', service, data: service });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'الخدمة موجودة بالفعل في نفس القسم' });
    }
    next(err);
  }
});
};
