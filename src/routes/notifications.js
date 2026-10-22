'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const { auth } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');

const router = express.Router();

function owner(req, role) {
  return role === 'client' ? req.clientId : req.userId;
}

function roleAuth(role) {
  if (role === 'client') return clientAuth;
  if (role !== 'admin') return auth();
  return (req, res, next) => auth()(req, res, () => {
    if (req.user?.role !== 'admin' && !req.user?.adminRole) return res.status(403).json({ message: 'هذه الإشعارات مخصصة لحسابات الإدارة.' });
    return next();
  });
}

function mountRoleRoutes(role) {
  const guard = roleAuth(role);

  router.post('/' + role + '/push-token', guard, async (req, res, next) => {
    try {
      if (role === 'fanni' && req.user?.role !== 'fanni') {
        return res.status(403).json({ message: 'تسجيل إشعارات الفنيين يتطلب حساب فني.' });
      }
      if (role === 'admin' && req.user?.role !== 'admin' && !req.user?.adminRole) return res.status(403).json({ message: 'تسجيل إشعارات الإدارة يتطلب حسابًا إداريًا.' });
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!/^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token)) {
        return res.status(400).json({ message: 'رمز إشعارات Expo غير صالح.' });
      }
      const platform = ['android', 'ios'].includes(req.body?.platform) ? req.body.platform : 'android';
      await PushToken.findOneAndUpdate(
        { token },
        { $set: { recipientRole: role, recipientId: owner(req, role), platform } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      return res.status(200).json({ message: 'تم تسجيل جهاز الإشعارات.' });
    } catch (error) { return next(error); }
  });

  router.delete('/' + role + '/push-token', guard, async (req, res, next) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!token) return res.status(400).json({ message: 'رمز الإشعارات مطلوب.' });
      const result = await PushToken.deleteOne({
        token, recipientRole: role, recipientId: owner(req, role)
      });
      return res.json({ message: 'تم إلغاء تسجيل جهاز الإشعارات.', deleted: result.deletedCount || 0 });
    } catch (error) { return next(error); }
  });

  router.get('/' + role, guard, async (req, res, next) => {
    try {
      const recipientId = owner(req, role);
      const notifications = await Notification.find({ recipientRole: role, recipientId })
        .sort({ createdAt: -1 }).limit(50).lean();
      const unreadCount = await Notification.countDocuments({ recipientRole: role, recipientId, readAt: null });
      return res.set('Cache-Control', 'no-store').json({
        notifications: notifications.map(item => ({
          id: String(item._id), type: item.type, title: item.title,
          message: item.message, link: item.link || '',
          read: Boolean(item.readAt), createdAt: item.createdAt
        })),
        unreadCount
      });
    } catch (error) { return next(error); }
  });

  router.patch('/' + role + '/read-all', guard, async (req, res, next) => {
    try {
      const result = await Notification.updateMany(
        { recipientRole: role, recipientId: owner(req, role), readAt: null },
        { $set: { readAt: new Date() } }
      );
      return res.json({ message: 'تم تعليم الإشعارات كمقروءة', modified: result.modifiedCount || 0 });
    } catch (error) { return next(error); }
  });

  router.patch('/' + role + '/:id/read', guard, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف الإشعار غير صالح' });
      const item = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipientRole: role, recipientId: owner(req, role), readAt: null },
        { $set: { readAt: new Date() } }, { new: true }
      );
      if (!item) {
        const exists = await Notification.exists({ _id: req.params.id, recipientRole: role, recipientId: owner(req, role) });
        if (!exists) return res.status(404).json({ message: 'الإشعار غير موجود' });
      }
      return res.json({ message: 'تم تعليم الإشعار كمقروء' });
    } catch (error) { return next(error); }
  });
}

mountRoleRoutes('client');
mountRoleRoutes('fanni');
mountRoleRoutes('admin');

module.exports = router;
