'use strict';

module.exports = function registerAdminNotificationsAndLayout(router, context) {
  const { express, bcrypt, jwt, Joi, mongoose, crypto, Fanni, Client, Notification, TopupRequest, Order, Rating, Complaint, WalletTransaction, createNotification, Service, Region, AdminConfig, AdminAuditLog, createAdminAuditWriter, PageVisit, CATEGORIES, ALL_SERVICES, normalizeServiceName, findCategoryByService, findCategoryByLabel, auth, defaultAdminPermissions, ADMIN_PERMISSION_KEYS, validate, normalizePhone, ADMIN_TOKEN_EXPIRY, MAX_LIST_LIMIT, loginSchema, amountSchema, reasonSchema, complaintStatusSchema, VALID_LEVELS, VALID_BADGES, ADMIN_ROLES, writeAdminAudit, ADMIN_LAYOUT_SECTIONS, ADMIN_LAYOUT_TABS, UI_LAYOUT_FIELDS, uiLayoutPageSchema, BROKEN_WALL_SCREEN_SERVICE_NAMES, publicFanni, publicTopup, adminName, decision, validId, sendBadId, getLoginPhone, notImplemented, isRootAdmin, requireRootAdmin, publicAdminUser, getAdminConfig, sanitizeAdminUiLayout, normalizeForCompare, normalizeBrokenWallScreenServiceName, isBrokenWallScreenService, parseBooleanStrict, validateNameField, validateCategoryField, validateSortOrder, buildAdminCategoriesMap, findServicesByName, ensureHiddenLegacy } = context;

router.get('/notifications/direct', auth('admin'), async (req, res, next) => {
  try {
    const records = await Notification.find({ type: 'admin_message' }).sort({ createdAt: -1 }).limit(5000).lean();
    const groups = new Map();
    for (const item of records) {
      const legacyKey = !item.campaignId
        ? [item.recipientRole, new Date(item.createdAt || 0).toISOString(), item.title, item.message].join('|')
        : '';
      const key = item.campaignId ? 'campaign:' + item.campaignId : 'legacy:' + legacyKey;
      let group = groups.get(key);
      if (!group) {
        group = { id: String(item._id), campaignId: item.campaignId || null, recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt, count: 0 };
        groups.set(key, group);
      }
      group.count += 1;
    }
    return res.set('Cache-Control', 'no-store').json({ notifications: Array.from(groups.values()).slice(0, 200) });
  } catch (error) { return next(error); }
});

router.delete('/notifications/direct/:id', auth('admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return sendBadId(res);
    const item = await Notification.findOne({ _id: req.params.id, type: 'admin_message' }).lean();
    if (!item) return res.status(404).json({ message: 'الإشعار الإداري غير موجود أو تم حذفه بالفعل' });
    const filter = item.campaignId
      ? { type: 'admin_message', campaignId: item.campaignId, recipientRole: item.recipientRole }
      : { type: 'admin_message', recipientRole: item.recipientRole, title: item.title, message: item.message, createdAt: item.createdAt };
    const result = await Notification.deleteMany(filter);
    if (!result.deletedCount) return res.status(404).json({ message: 'الإشعار غير موجود أو تم حذفه بالفعل' });
    await writeAdminAudit(req, 'حذف إشعار إداري', 'notifications', item.campaignId || String(item._id), JSON.stringify({ deleted: result.deletedCount, role: item.recipientRole, title: item.title }));
    return res.json({ message: 'تم حذف الإشعار من جميع الحسابات المستهدفة', deleted: result.deletedCount });
  } catch (error) { return next(error); }
});

router.get('/ui-layout/:page', auth('admin'), async (req, res, next) => {
  try {
    const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
    if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
    const config = await getAdminConfig();
    const field = UI_LAYOUT_FIELDS[page];
    const layout = sanitizeAdminUiLayout(config.get(field) || {});
    return res.set('Cache-Control', 'no-store').json({ page, layout });
  } catch (err) { next(err); }
});

router.put('/ui-layout/:page', auth('admin'), async (req, res, next) => {
  try {
    const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
    if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
    const bodySchema = Joi.object({ layout: Joi.object().unknown(true).required() }).required();
    const checked = bodySchema.validate(req.body || {}, { abortEarly: false, stripUnknown: false });
    if (checked.error) return res.status(400).json({ message: 'بيانات تخطيط الصفحة غير صالحة' });
    const field = UI_LAYOUT_FIELDS[page];
    const config = await getAdminConfig();
    const before = sanitizeAdminUiLayout(config.get(field) || {});
    const layout = sanitizeAdminUiLayout(checked.value.layout);
    config.set(field, layout);
    config.history.push({
      key: field, before, after: layout, by: adminName(req),
      byId: String(req.user?._id || ''), reason: 'حفظ تخطيط واجهة ' + page, createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حفظ تخطيط واجهة', 'ui-layout', page, JSON.stringify({ elementCount: Object.keys(layout.elements || {}).length }));
    return res.set('Cache-Control', 'no-store').json({ message: 'تم حفظ تخطيط الصفحة', page, layout });
  } catch (err) { next(err); }
});

router.delete('/ui-layout/:page', auth('admin'), async (req, res, next) => {
  try {
    const { error, value: page } = uiLayoutPageSchema.validate(String(req.params.page || '').trim());
    if (error) return res.status(400).json({ message: 'اسم الصفحة غير مسموح به' });
    const field = UI_LAYOUT_FIELDS[page];
    const config = await getAdminConfig();
    const before = sanitizeAdminUiLayout(config.get(field) || {});
    const emptyLayout = sanitizeAdminUiLayout({});
    config.set(field, emptyLayout);
    config.history.push({
      key: field, before, after: emptyLayout, by: adminName(req),
      byId: String(req.user?._id || ''), reason: 'حذف تخطيط واجهة ' + page, createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حذف تخطيط واجهة', 'ui-layout', page, JSON.stringify({ previousElementCount: Object.keys(before.elements || {}).length }));
    return res.set('Cache-Control', 'no-store').json({ message: 'تم حذف تخطيط الصفحة وإعادة الإعدادات الافتراضية', page, layout: emptyLayout });
  } catch (err) { next(err); }
});

router.get('/settings', auth('admin'), async (req, res, next) => {
  try { const config = await getAdminConfig(); return res.set('Cache-Control', 'no-store').json({ settings: config.settings }); }
  catch (err) { next(err); }
});

router.put('/settings', auth('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      siteName: Joi.string().trim().min(2).max(100).required(),
      maintenance: Joi.boolean().required(),
      maintenanceMessage: Joi.string().trim().max(500).allow('').required(),
      maxFanniSignupAttempts: Joi.number().integer().min(1).max(100).required(),
      walletPhone1: Joi.string().trim().max(20).allow('').default(''),
      walletPhone2: Joi.string().trim().max(20).allow('').default('')
    }).required();
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: 'بيانات الإعدادات غير صحيحة' });
    const config = await getAdminConfig();
    const before = config.settings.toObject ? config.settings.toObject() : { ...config.settings };
    config.settings = value;
    config.history.push({ key: 'settings', before, after: value, by: adminName(req), byId: String(req.user?._id || ''), reason: 'تعديل إعدادات النظام', createdAt: new Date() });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حفظ إعدادات النظام', 'settings', 'settings', JSON.stringify({ before, after: value }));
    return res.json({ message: 'تم حفظ الإعدادات. وضع الصيانة مفعل على طلبات العملاء والفنيين؛ حد محاولات تسجيل الفني لكل IP خلال 15 دقيقة مطبق.', settings: config.settings });
  } catch (err) { next(err); }
});

router.delete('/content/faqs/:index', auth('admin'), async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: 'رقم السؤال غير صالح' });
    }
    const config = await getAdminConfig();
    const content = config.content || { announcement: '', faqs: [] };
    const faqs = Array.isArray(content.faqs) ? content.faqs : [];
    if (index >= faqs.length) {
      return res.status(404).json({ message: 'السؤال غير موجود أو تم حذفه بالفعل' });
    }
    const beforeCount = faqs.length;
    const removed = faqs[index];
    faqs.splice(index, 1);
    content.faqs = faqs;
    config.content = content;
    config.history.push({
      key: 'content',
      before: { announcementLength: String(content.announcement || '').length, faqCount: beforeCount },
      after: { announcementLength: String(content.announcement || '').length, faqCount: faqs.length },
      by: adminName(req),
      byId: String(req.user?._id || ''),
      reason: 'حذف سؤال شائع: ' + String(removed.question || '').slice(0, 200),
      createdAt: new Date()
    });
    if (config.history.length > 200) config.history = config.history.slice(-200);
    await config.save();
    await writeAdminAudit(req, 'حذف سؤال شائع', 'content', 'faq', 'تم حذف سؤال من الأسئلة الشائعة');
    return res.json({ message: 'تم حذف السؤال ونشر التغيير لواجهة العميل.', content: config.content });
  } catch (err) { next(err); }
});

router.get('/content', auth('admin'), async (req, res, next) => {
  try { const config = await getAdminConfig(); return res.json({ content: config.content }); }
  catch (err) { next(err); }
});
};
