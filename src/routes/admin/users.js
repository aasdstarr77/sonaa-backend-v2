'use strict';

const express = require('express');

function createAdminUsersRouter({
  auth,
  Fanni,
  ADMIN_ROLES,
  MAX_LIST_LIMIT,
  validId,
  sendBadId,
  requireRootAdmin,
  isRootAdmin,
  publicAdminUser,
  defaultAdminPermissions,
  ADMIN_PERMISSION_KEYS,
  adminName,
  writeAdminAudit
}) {
  const router = express.Router();

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

  return router;
}

module.exports = createAdminUsersRouter;
