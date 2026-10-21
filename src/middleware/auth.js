'use strict';

const jwt = require('jsonwebtoken');
const Fanni = require('../models/Fanni');

const ADMIN_ROLES = ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'];

const PERMISSION_SECTIONS = {
  dashboard: [/^\/me$/, /^\/reports?(\/|$)/, /^\/stats?(\/|$)/],
  fannis: [/^\/fannis(\/|$)/],
  orders: [/^\/orders(\/|$)/],
  complaints: [/^\/complaints(\/|$)/],
  services: [/^\/services(\/|$)/],
  clients: [/^\/clients(\/|$)/],
  topups: [/^\/topup-requests(\/|$)/],
  wallet: [/^\/wallet(\/|$)/, /^\/fannis\/[^/]+\/(set-balance|add-balance)$/],
  pricing: [/^\/pricing(\/|$)/],
  settings: [/^\/settings(\/|$)/],
  content: [/^\/content(\/|$)/],
  support: [/^\/support(\/|$)/],
  regions: [/^\/regions(\/|$)/],
  offers: [/^\/offers(\/|$)/],
  notifications: [/^\/notifications(\/|$)/],
  clientsData: [/^\/client-accounts(\/|$)/]
};

function canAccessAdmin(user, req) {
  if (user.role === 'admin') return true;
  const role = user.adminRole;
  if (!ADMIN_ROLES.includes(role)) return false;

  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '/');
  // لا يمكن تفويض إدارة الحسابات الإدارية أو سجل التدقيق لأي منصب فرعي.
  if (path.startsWith('/admin-users') || path === '/bootstrap' || path.startsWith('/audit-logs')) return false;

  let section = null;
  for (const [key, patterns] of Object.entries(PERMISSION_SECTIONS)) {
    if (patterns.some(pattern => pattern.test(path))) { section = key; break; }
  }
  // أي endpoint غير مصنّف يظل مغلقًا للمناصب الفرعية إلى أن تتم مراجعته.
  if (!section) return false;

  const permissions = user.adminPermissions && typeof user.adminPermissions === 'object'
    ? user.adminPermissions : {};
  const grant = permissions[section] || {};
  const isRead = method === 'GET' || method === 'HEAD';
  return isRead ? grant.read === true : grant.write === true;
}
function auth(requiredRole = null) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'غير مصرح - Token مفقود' });
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await Fanni.findById(decoded.id);
      if (!user) return res.status(401).json({ message: 'المستخدم غير موجود' });
      if (user.status === 'معلق' || user.status === 'مرفوض') return res.status(403).json({ message: 'حسابك معلق أو مرفوض' });

      if (requiredRole === 'admin') {
        if (user.role !== 'admin' && !ADMIN_ROLES.includes(user.adminRole)) {
          return res.status(403).json({ message: 'ليس لديك صلاحية دخول لوحة الإدارة' });
        }
        if (!canAccessAdmin(user, req)) return res.status(403).json({ message: 'هذا الإجراء خارج صلاحيات منصبك الإداري' });
      } else if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
        return res.status(403).json({ message: 'ليس لديك صلاحية' });
      }

      req.user = user;
      req.userId = user._id;
      next();
    } catch (e) {
      if (e.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Token غير صالح' });
      if (e.name === 'TokenExpiredError') return res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
      next(e);
    }
  };
}

module.exports = { auth };
