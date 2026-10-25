'use strict';

const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const Fanni = require('../models/Fanni');
const { sendWebPushNotification } = require('./webPush');

async function sendPushNotification({ recipientRole, recipientId, title, message, type, link = '' }) {
  try {
    const devices = await PushToken.find({ recipientRole, recipientId }).select('token').lean();
    if (!devices.length || typeof fetch !== 'function') return;

    const messages = devices.map(device => ({
      to: device.token,
      title: String(title || 'إشعار من صُنّاع').slice(0, 100),
      body: String(message || '').slice(0, 300),
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      data: { type: String(type || 'general').slice(0, 50), link: String(link || '').slice(0, 200) }
    }));

    for (let start = 0; start < messages.length; start += 100) {
      const batch = messages.slice(start, start + 100);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Expo push request failed:', response.status);
        continue;
      }
      const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      for (let index = 0; index < tickets.length; index += 1) {
        if (tickets[index]?.status === 'error' && tickets[index]?.details?.error === 'DeviceNotRegistered') {
          const token = batch[index]?.to;
          if (token) await PushToken.deleteOne({ token }).catch(() => {});
        }
      }
    }
  } catch (error) {
    // Push delivery must never roll back a successful business operation.
    console.error('Push notification delivery failed:', error.message);
  }
}

async function createNotification({ recipientRole, recipientId, type, title, message, link = '', dedupeKey = null }) {
  if (!recipientId || !['client', 'fanni', 'admin'].includes(recipientRole)) return null;
  try {
    const payload = { recipientRole, recipientId, type, title, message, link };
    let notification;
    let isNew = true;
    if (dedupeKey) {
      const result = await Notification.findOneAndUpdate(
        { dedupeKey },
        { $setOnInsert: { ...payload, dedupeKey } },
        { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
      );
      notification = result?.value || result;
      isNew = !result?.lastErrorObject?.updatedExisting;
    } else {
      notification = await Notification.create(payload);
    }
    if (isNew) {
      await Promise.allSettled([sendPushNotification({ recipientRole, recipientId, title, message, type, link }),sendWebPushNotification({ recipientRole, recipientId, title, message, type, link })]);
    }
    return notification;
  } catch (error) {
    // Notifications must never roll back a successful order or wallet operation.
    console.error('Notification create failed:', error.message);
    return null;
  }
}

async function notifyAdmins({ type, title, message, link = '', dedupeKey = null }) {
  try {
    const admins = await Fanni.find({ $or: [{ role: 'admin' }, { adminRole: { $in: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'] } }] }).select('_id').lean();
    for (const admin of admins) await createNotification({ recipientRole: 'admin', recipientId: admin._id, type, title, message, link, dedupeKey: dedupeKey ? `${dedupeKey}:${String(admin._id)}` : null });
  } catch (error) { console.error('Admin notification creation failed:', error.message); }
}
module.exports = { createNotification, sendPushNotification, notifyAdmins };
