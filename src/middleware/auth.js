'use strict';

const jwt = require('jsonwebtoken');
const Fanni = require('../models/Fanni');
const { normalizePhone } = require('../utils/phone');

const ADMIN_ROLES = ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'];

const ADMIN_PERMISSION_KEYS = ['dashboard','fannis','orders','publishOrders','complaints','services','clients','topups','wallet','pricing','settings','content','support','regions','offers','notifications','clientsData'];
const ROLE_WRITE_SECTIONS = {
  'قراءة فقط': [],
  'مشرف': ['orders','complaints','support','offers'],
  'مشرف أول': ['fannis','orders','complaints','services','clients','topups','wallet','support','regions','offers','notifications','clientsData'],
  'مدير': ADMIN_PERMISSION_KEYS
};
function defaultAdminPermissions(role) {
  const writes = new Set(ROLE_WRITE_SECTIONS[role] || []);
  const reads = role === 'قراءة فقط'
    ? new Set(ADMIN_PERMISSION_KEYS)
    : new Set(role === 'مدير' || role === 'مشرف أول'
      ? ADMIN_PERMISSION_KEYS
      : ['dashboard','fannis','orders','complaints','services','clients','topups','wallet','pricing','content','support','regions','offers','notifications','clientsData']);
  return Object.fromEntries(ADMIN_PERMISSION_KEYS.map(key => [key, {
    read: reads.has(key) || writes.has(key),
    write: writes.has(key)
  }]));
}

const PERMISSION_SECTIONS = {
  dashboard: [/^\/me$/, /^\/counts$/, /^\/reports?(\/|$)/, /^\/stats?(\/|$)/],
  wallet: [/^\/wallet(\/|$)/, /^\/fannis\/[^/]+\/(set-balance|add-balance)$/],
  fannis: [/^\/fannis(\/|$)/],
  publishOrders: [/^\/admin\/[^/]+\/(publish|voice-reviewed)$/],
  orders: [/^\/orders(\/|$)/],
  complaints: [/^\/complaints(\/|$)/],
  services: [/^\/services(\/|$)/],
  clients: [/^\/clients(\/|$)/],
  topups: [/^\/topup-requests(\/|$)/],
  pricing: [/^\/pricing(\/|$)/],
  settings: [/^\/settings(\/|$)/],
  content: [/^\/content(\/|$)/],
  support: [/^\/support(\/|$)/],
  regions: [/^\/regions(\/|$)/],
  offers: [/^\/offers(\/|$)/],
  notifications: [/^\/notifications(\/|$)/],
  clientsData: [/^\/client-accounts(\/|$)/]
};

function isRootAdmin(user) {
  const configuredPhone = normalizePhone(String(process.env.ADMIN_PHONE || ''));
  return Boolean(user && user.role === 'admin' && configuredPhone &&
    normalizePhone(String(user.phone || '')) === configuredPhone);
}

function canAccessAdmin(user, req) {
  if (isRootAdmin(user)) return true;
  const role = user.adminRole || (user.role === 'admin' ? 'مشرف' : null);
  if (!ADMIN_ROLES.includes(role)) return false;

  const method = String(req.method || 'GET').toUpperCase();
  // Direct app-level admin endpoints may expose the full /api/admin prefix,
  // while router-mounted endpoints expose only their local path. Normalize both.
  const path = (String(req.path || '/').replace(/^\/api\/(?:admin|admins|auth\/admin)(?=\/|$)/, '') || '/');
  // لا يمكن تفويض إدارة الحسابات الإدارية أو سجل التدقيق لأي منصب فرعي.
  if (path.startsWith('/admin-users') || path === '/bootstrap' || path.startsWith('/audit-logs')) return false;

  let section = null;
  for (const [key, patterns] of Object.entries(PERMISSION_SECTIONS)) {
    if (patterns.some(pattern => pattern.test(path))) { section = key; break; }
  }
  // أي endpoint غير مصنّف يظل مغلقًا للمناصب الفرعية إلى أن تتم مراجعته.
  if (!section) return false;

  const defaults = defaultAdminPermissions(role);
  const stored = user.adminPermissions && typeof user.adminPermissions === 'object'
    ? user.adminPermissions : {};
  // Old releases saved a full permission matrix that accidentally replaced role defaults.
  // Only the new sparse override format may customize the defaults.
  const overrides = stored.__customOverrides === true ? stored : {};
  const grant = { ...defaults[section], ...(overrides[section] || {}) };
  const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && /^\/reports?(\/|$)/.test(path));
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
      } else if (requiredRole && user.role !== requiredRole && !isRootAdmin(user)) {
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

module.exports = { auth, canAccessAdmin, isRootAdmin, PERMISSION_SECTIONS, defaultAdminPermissions, ADMIN_PERMISSION_KEYS };
