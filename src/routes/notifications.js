'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const { clientAuth } = require('../middleware/clientAuth');

const router = express.Router();

function owner(req, role) {
  return role === 'client' ? req.clientId : req.userId;
}

function roleAuth(role) {
  return role === 'client' ? clientAuth : auth();
}

function mountRoleRoutes(role) {
  const guard = roleAuth(role);

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

module.exports = router;
