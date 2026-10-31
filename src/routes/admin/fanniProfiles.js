'use strict';

const express = require('express');

function createAdminFanniProfilesRouter({
  auth,
  validate,
  Joi,
  Fanni,
  Rating,
  Order,
  bcrypt,
  createNotification,
  writeAdminAudit,
  publicFanni,
  validId,
  sendBadId,
  decision,
  adminName,
  MAX_LIST_LIMIT,
  reasonSchema
}) {
  const router = express.Router();

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

  return router;
}

module.exports = createAdminFanniProfilesRouter;
