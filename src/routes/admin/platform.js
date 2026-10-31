'use strict';

const express = require('express');

function createAdminPlatformRouter({
  auth,
  Joi,
  getAdminConfig,
  writeAdminAudit,
  adminName,
  Order,
  Complaint,
  Client,
  Rating,
  Fanni,
  AdminAuditLog,
  PageVisit,
  normalizePhone,
  bcrypt
}) {
  const router = express.Router();

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
      client.tokenVersion = Number(client.tokenVersion || 0) + 1;
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

  router.get('/page-visits', auth('admin'), async (req,res,next)=>{try{const parsedLimit=Number.parseInt(req.query.limit,10),limit=Number.isInteger(parsedLimit)&&parsedLimit>0?Math.min(parsedLimit,200):100,pageKey=String(req.query.pageKey||'').trim().slice(0,80),match=pageKey?{pageKey}:{};const [summary,recent,total]=await Promise.all([PageVisit.aggregate([{$match:match},{$group:{_id:{pageKey:'$pageKey',pageName:'$pageName'},visits:{$sum:1},lastVisit:{$max:'$visitedAt'}}},{$sort:{visits:-1,lastVisit:-1}},{$limit:100}]),PageVisit.find(match).sort({visitedAt:-1}).limit(limit).select('pageKey pageName path referrer visitedAt').lean(),PageVisit.countDocuments(match)]);return res.set('Cache-Control','no-store').json({summary:summary.map(item=>({pageKey:item._id.pageKey,pageName:item._id.pageName,visits:item.visits,lastVisit:item.lastVisit})),recent,total});}catch(err){next(err);}});

  return router;
}

module.exports = createAdminPlatformRouter;
