'use strict';

const express = require('express');
const { normalizeArea, getEffectiveAreaOptions } = require('../../config/areas');
const { normalizePhone } = require('../../utils/phone');

function createAdminFanniProfilesRouter({
  Region,
  AREA_OPTIONS,
  ALL_SERVICES,
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

  router.get('/fannis/:id/profile', auth('admin'), async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);
      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' }).select('-passwordHash').lean();
      if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });
      return res.set('Cache-Control', 'no-store').json({ fanni: { _id: String(fanni._id), name: fanni.name, phone: fanni.phone, specialties: fanni.specialties || [], areas: fanni.areas || [], status: fanni.status } });
    } catch (err) { next(err); }
  });

  router.patch('/fannis/:id/profile', auth('admin'), async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);
      const schema = Joi.object({
        phone: Joi.string().trim().required(),
        specialties: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1).max(20).required(),
        areas: Joi.array().items(Joi.string().trim().min(2).max(60)).min(1).max(30).required()
      }).required();
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: 'راجع رقم الهاتف والتخصصات ومناطق العمل.' });
      const phone = normalizePhone(value.phone);
      if (!phone || !/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'رقم الهاتف غير صحيح.' });
      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
      if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });
      if (fanni.pendingProfileChange?.requestedAt) return res.status(409).json({ message: 'لدى الفني طلب تعديل بيانات قيد المراجعة. راجع الطلب أولًا.' });
      const duplicate = await Fanni.findOne({ phone, _id: { $ne: fanni._id } }).select('_id');
      if (duplicate) return res.status(409).json({ message: 'رقم الهاتف مسجل بالفعل في حساب آخر.' });
      const allRegions=await Region.find({}).select('name isActive isDeleted isBase').lean();
      const allowedAreas=new Set(getEffectiveAreaOptions(allRegions).map(normalizeArea));
      const areas = [...new Map(value.areas.map(item => [normalizeArea(item), String(item).normalize('NFC').trim().replace(/\s+/g, ' ')])).values()];
      if (areas.some(item => !allowedAreas.has(normalizeArea(item)))) return res.status(400).json({ message: 'اختار مناطق العمل من القائمة المعتمدة فقط.' });
      const normalizedAreas = areas;
      const specialties = [...new Set(value.specialties.map(item => item.normalize('NFC').trim()))];
      if (specialties.some(item => !(ALL_SERVICES || []).some(service => service.normalize('NFC').trim() === item))) return res.status(400).json({ message: 'توجد خدمة غير موجودة في قائمة الخدمات المعتمدة.' });
      const before = { phone: fanni.phone, specialties: [...(fanni.specialties || [])], areas: [...(fanni.areas || [])] };
      const auditDetails = JSON.stringify({ before, after: { phone, specialties, areas: normalizedAreas } });
      const profileDecision = decision(req, 'تعديل بيانات فني', 'تعديل مباشر من لوحة الإدارة');
      profileDecision.meta = { before, after: { phone, specialties, areas: normalizedAreas }, source: 'admin-profile-editor' };

      // Atomic update avoids re-validating unrelated legacy fields on the whole document.
      const updatedFanni = await Fanni.findOneAndUpdate(
        { _id: fanni._id, role: 'fanni' },
        { $set: { phone, specialties, areas: normalizedAreas }, $push: { decisions: profileDecision } },
        { new: true, runValidators: true, context: 'query' }
      ).select('-passwordHash');
      if (!updatedFanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });

      // Audit logging must not keep the profile-save response pending.
      writeAdminAudit(req, 'تعديل بيانات فني', 'fannis', String(updatedFanni._id), auditDetails)
        .catch(err => console.error('Could not write technician profile audit:', err.message));
      return res.set('Cache-Control', 'no-store').json({
        message: 'تم حفظ بيانات الفني بنجاح.',
        fanni: publicFanni(updatedFanni)
      });
    } catch (err) {
      if (err && err.code === 11000) return res.status(409).json({ message: 'رقم الهاتف مسجل بالفعل في حساب آخر.' });
      next(err);
    }
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
      const SupportPassword = require('../../models/SupportPassword');
      await SupportPassword.updateMany({ ownerRole: 'fanni', accountId: fanni._id, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: req.user._id } });
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
  
  router.patch('/fannis/:id/service-areas', auth('admin'), async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);
      const schema = Joi.object({
        specialties: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1).max(20).required(),
        areas: Joi.array().items(Joi.string().trim().min(2).max(100)).min(1).max(30).required()
      }).required();
      const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: 'اختار خدمة واحدة على الأقل ومنطقة عمل واحدة على الأقل.' });

      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
      if (!fanni) return res.status(404).json({ message: 'حساب الفني غير موجود.' });
      if (fanni.pendingProfileChange?.requestedAt) return res.status(409).json({ message: 'لدى الفني طلب تعديل بيانات قيد المراجعة. راجع الطلب أولًا قبل التعديل المباشر.' });

      const activeRegions = await Region.find({ isActive: true }).select('name').lean();
      const allowedAreas = new Set([...getEffectiveAreaOptions(activeRegions), ...(AREA_OPTIONS || [])].map(normalizeArea));
      const areas = [...new Map(value.areas.map(item => [normalizeArea(item), String(item).normalize('NFC').trim().replace(/\s+/g, ' ')])).values()];
      const invalidAreas = areas.filter(item => !allowedAreas.has(normalizeArea(item)));
      if (invalidAreas.length) return res.status(400).json({ message: 'توجد منطقة غير معتمدة في القائمة. حدّث قائمة المناطق ثم حاول مرة أخرى.', invalidAreas });

      const normalizedAreas = areas;
      const specialties = [...new Set(value.specialties.map(item => item.normalize('NFC').trim()).filter(Boolean))];
      const invalidSpecialties = specialties.filter(item => !(ALL_SERVICES || []).some(service => service.normalize('NFC').trim() === item));
      if (invalidSpecialties.length) return res.status(400).json({ message: 'توجد خدمة غير موجودة في قائمة الخدمات المعتمدة.', invalidSpecialties });
      const before = { specialties: [...(fanni.specialties || [])], areas: [...(fanni.areas || [])] };
      fanni.specialties = specialties;
      fanni.areas = normalizedAreas;
      fanni.decisions.push(decision(req, 'تعديل تخصصات ومناطق فني', 'تعديل مباشر من لوحة الإدارة'));
      fanni.decisions[fanni.decisions.length - 1].meta = {
        before,
        after: { specialties, areas: normalizedAreas },
        source: 'admin-direct-edit'
      };
      await fanni.save();
      const after = { specialties, areas: normalizedAreas };
      await writeAdminAudit(req, 'تعديل تخصصات ومناطق فني', 'fannis', String(fanni._id), JSON.stringify({ before, after }));
      return res.json({ message: 'تم تحديث خدمات ومناطق عمل الفني بنجاح.', fanni: publicFanni(fanni), changes: { before, after } });
    } catch (err) { next(err); }
  });

  router.get('/fanni-profile-edits', auth('admin'), async (req, res, next) => {
    try {
      const fannis = await Fanni.find({ role: 'fanni', 'pendingProfileChange.requestedAt': { $exists: true, $ne: null } }).select('-passwordHash').sort({ 'pendingProfileChange.requestedAt': 1 }).limit(MAX_LIST_LIMIT).lean();
      return res.set('Cache-Control', 'no-store').json({ requests: fannis.map(item => {
        const pending = item.pendingProfileChange || {};
        const current = { phone: item.phone, specialties: item.specialties || [], areas: item.areas || [] };
        const sameArray = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
        const changedFields = Array.isArray(pending.changedFields) && pending.changedFields.length ? pending.changedFields : [
          ...(String(pending.phone || current.phone) !== String(current.phone) ? ['phone'] : []),
          ...(!sameArray(pending.specialties, current.specialties) ? ['specialties'] : []),
          ...(!sameArray(pending.areas, current.areas) ? ['areas'] : [])
        ];
        return {
          _id: item._id, name: item.name, phone: item.phone,
          specialties: current.specialties, areas: current.areas,
          pendingProfileChange: { ...pending, before: pending.before || current, changedFields },
          status: item.status, createdAt: item.createdAt
        };
      }) });
    } catch (err) { next(err); }
  });
  
  router.post('/fanni-profile-edits/:id/approve', auth('admin'), async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return sendBadId(res);
      const fanni = await Fanni.findOne({ _id: req.params.id, role: 'fanni' });
      if (!fanni || !fanni.pendingProfileChange?.requestedAt) return res.status(404).json({ message: 'طلب تعديل البيانات غير موجود أو تمت مراجعته بالفعل' });
      const pending = fanni.pendingProfileChange;
      const before = { phone: String(fanni.phone || ''), specialties: [...(fanni.specialties || [])], areas: [...(fanni.areas || [])] };
      const sameArray = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
      const changedFields = Array.isArray(pending.changedFields) && pending.changedFields.length ? pending.changedFields : [
        ...(String(pending.phone || before.phone) !== before.phone ? ['phone'] : []),
        ...(!sameArray(pending.specialties, before.specialties) ? ['specialties'] : []),
        ...(!sameArray(pending.areas, before.areas) ? ['areas'] : [])
      ];
      if (!changedFields.length) return res.status(409).json({ message: 'الطلب لا يحتوي على تغييرات فعلية. ارفضه واطلب من الفني إرسال التعديلات من جديد.' });
      if (changedFields.includes('phone')) {
        const duplicate = await Fanni.findOne({ phone: pending.phone, _id: { $ne: fanni._id } }).select('_id');
        if (duplicate) return res.status(409).json({ message: 'رقم الهاتف المطلوب أصبح مسجلًا في حساب آخر. ارفض الطلب واطلب من الفني رقمًا آخر.' });
        fanni.phone = pending.phone;
      }
      if (changedFields.includes('specialties')) fanni.specialties = pending.specialties;
      if (changedFields.includes('areas')) fanni.areas = pending.areas;
      fanni.pendingProfileChange = undefined;
      fanni.decisions.push(decision(req, 'اعتماد تعديل بيانات', 'اعتماد طلب تعديل بيانات الفني'));
      fanni.decisions[fanni.decisions.length - 1].meta = { before, after: { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas }, changedFields };
      await fanni.save();
      await writeAdminAudit(req, 'اعتماد تعديل بيانات فني', 'fannis', String(fanni._id), JSON.stringify({ before, after: { phone: fanni.phone, specialties: fanni.specialties, areas: fanni.areas }, changedFields }));
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
