'use strict';

const jwt = require('jsonwebtoken');
const Fanni = require('../models/Fanni');

const ADMIN_ROLES = ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'];

function canAccessAdmin(user, req) {
  if (user.role === 'admin') return true;
  const role = user.adminRole;
  if (!ADMIN_ROLES.includes(role)) return false;

  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '/');

  // إدارة حسابات المشرفين والصلاحيات وسجل التدقيق محصورة في المدير العام.
  if (path.startsWith('/admin-users') || path === '/bootstrap' || path.startsWith('/audit-logs')) return false;
  if (method === 'GET' || method === 'HEAD') return true;
  if (role === 'قراءة فقط') return false;

  if (role === 'مدير') {
    // المدير التشغيلي لا يغيّر إعدادات الدخول أو التسعير أو الأرصدة/المحافظ.
    if (path.startsWith('/pricing') || path.startsWith('/settings') ||
        path.startsWith('/wallet') || /^\/fannis\/[^/]+\/(set-balance|add-balance)$/.test(path) ||
        path.startsWith('/topup-requests/')) return false;
    return true;
  }

  const isComplaintDecision = method === 'PATCH' && /^\/complaints\/[^/]+$/.test(path);
  const isSupportReview = method === 'POST' && /^\/support\/[^/]+\/review$/.test(path);
  const isFanniDecision = method === 'POST' && /^\/fannis\/[^/]+\/(approve|reject|disable|enable)$/.test(path);
  const isOfferDecision = method === 'POST' && /^\/offers\/[^/]+\/[^/]+\/reject$/.test(path);
  if (role === 'مشرف أول') {
    const isFanniManagement = method === 'PATCH' && /^\/fannis\/[^/]+\/(level|badge|note|limit)$/.test(path);
    const isOfferRemoval = method === 'DELETE' && /^\/offers\/[^/]+\/[^/]+$/.test(path);
    const isOrderRemoval = method === 'DELETE' && /^\/orders\/[^/]+$/.test(path);
    const isServiceWrite = ['POST', 'PATCH'].includes(method) && path.startsWith('/services');
    return isComplaintDecision || isSupportReview || isFanniDecision || isOfferDecision || isFanniManagement || isOfferRemoval || isOrderRemoval || isServiceWrite;
  }
  // المشرف: قرارات الشكاوى الأساسية واعتماد/رفض/تعليق الفنيين ورفض العرض.
  return isComplaintDecision || isSupportReview || isFanniDecision || isOfferDecision;
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
