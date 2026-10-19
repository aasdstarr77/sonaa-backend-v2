'use strict';

const Notification = require('../models/Notification');

async function createNotification({ recipientRole, recipientId, type, title, message, link = '', dedupeKey = null }) {
  if (!recipientId || !['client', 'fanni'].includes(recipientRole)) return null;
  try {
    const payload = { recipientRole, recipientId, type, title, message, link };
    if (dedupeKey) {
      return await Notification.findOneAndUpdate(
        { dedupeKey },
        { $setOnInsert: { ...payload, dedupeKey } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    return await Notification.create(payload);
  } catch (error) {
    // Notifications must never roll back a successful order or wallet operation.
    console.error('Notification create failed:', error.message);
    return null;
  }
}

module.exports = { createNotification };
