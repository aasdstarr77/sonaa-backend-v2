'use strict';

const crypto = require('crypto');
const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const Fanni = require('../models/Fanni');
const { sendWebPushNotification } = require('./webPush');

// Bound all external notification-provider requests so a slow provider cannot
// stall an API action or keep a serverless invocation open indefinitely.
function notificationFetch(url, options = {}) {
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(4000) : undefined;
  return globalThis.fetch(url, { ...options, ...(signal ? { signal } : {}) });
}

function channelFor(type) {
  if (['order_new', 'new_order', 'admin_new_order'].includes(type)) return 'order_new';
  if (['fanni_register', 'new_fanni', 'admin_new_technician'].includes(type)) return 'fanni_register';
  if (['client_register', 'new_client', 'admin_new_client'].includes(type)) return 'client_register';
  if (['password_reset', 'admin_password_recovery'].includes(type)) return 'password_reset';
  if (['support', 'new_complaint', 'admin_support_request', 'admin_new_complaint'].includes(type)) return 'support';
  if (['wallet_charge', 'topup_request', 'admin_new_topup'].includes(type)) return 'wallet_charge';
  return 'support';
}
function destinationFor(type) {
  return ({ order_new: 'orders', fanni_register: 'technicians', client_register: 'clients',
    password_reset: 'clients', support: 'complaints', wallet_charge: 'technicians' })[channelFor(type)];
}
async function firebaseAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
    iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = unsigned + '.' + signer.sign(serviceAccount.private_key, 'base64url');
  const response = await notificationFetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error('Firebase OAuth token request failed: ' + response.status);
  return result.access_token;
}
async function sendFirebasePushNotifications(devices, payload) {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  if (!raw || typeof fetch !== 'function') return;
  const account = JSON.parse(raw);
  if (!account.project_id || !account.client_email || !account.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is incomplete');
  const accessToken = await firebaseAccessToken(account);
  const endpoint = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account.project_id) + '/messages:send';
  const type = String(payload.type || '');
  const data = {
    type: type.slice(0, 50), link: String(payload.link || '').slice(0, 200),
    destination: destinationFor(type)
  };
  await Promise.all(devices.map(async device => {
    const response = await notificationFetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token: device.token,
        notification: { title: String(payload.title || 'إشعار من صُنّاع').slice(0, 100), body: String(payload.message || '').slice(0, 300) },
        data,
        android: { priority: 'HIGH', notification: { channel_id: channelFor(type), click_action: 'com.sonaa.nativeadmin.OPEN_NOTIFICATION' } }
      } })
    });
    if (response.status === 404 || response.status === 410) await PushToken.deleteOne({ token: device.token }).catch(() => {});
    if (!response.ok) console.error('FCM delivery failed:', response.status, (await response.text().catch(() => '')).slice(0, 300));
  }));
}
async function sendPushNotification({ recipientRole, recipientId, title, message, type, link = '' }) {
  try {
    const devices = await PushToken.find({ recipientRole, recipientId }).select('token platform').lean();
    const expo = devices.filter(d => d.platform !== 'fcm-android' && /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(d.token));
    const fcm = devices.filter(d => d.platform === 'fcm-android');
    if (expo.length && typeof fetch === 'function') {
      const messages = expo.map(d => ({
        to: d.token, title: String(title || 'إشعار من صُنّاع').slice(0, 100),
        body: String(message || '').slice(0, 300), sound: 'default', priority: 'high',
        channelId: 'default',
        data: { type: String(type || 'general').slice(0, 50), link: String(link || '').slice(0, 200) }
      }));
      for (let start = 0; start < messages.length; start += 100) {
        const batch = messages.slice(start, start + 100);
        const response = await notificationFetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) continue;
        const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        for (let i = 0; i < tickets.length; i++) if (tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered') {
          const token = batch[i]?.to; if (token) await PushToken.deleteOne({ token }).catch(() => {});
        }
      }
    }
    if (fcm.length) {
      try { await sendFirebasePushNotifications(fcm, { title, message, type, link }); }
      catch (error) { console.error('FCM delivery unavailable:', error.message); }
    }
  } catch (error) { console.error('Push notification delivery failed:', error.message); }
}
async function createNotification({ recipientRole, recipientId, type, title, message, link = '', dedupeKey = null }) {
  if (!recipientId || !['client', 'fanni', 'admin'].includes(recipientRole)) return null;
  try {
    const payload = { recipientRole, recipientId, type, title, message, link };
    let notification, isNew = true;
    if (dedupeKey) {
      const result = await Notification.findOneAndUpdate(
        { dedupeKey }, { $setOnInsert: { ...payload, dedupeKey } },
        { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
      );
      notification = result?.value || result;
      isNew = !result?.lastErrorObject?.updatedExisting;
    } else notification = await Notification.create(payload);
    // The database notification is the source of truth. External push providers
    // are best-effort and must never hold the user's primary action indefinitely.
    if (isNew) {
      const delivery = Promise.allSettled([
        sendPushNotification({ recipientRole, recipientId, title, message, type, link }),
        sendWebPushNotification({ recipientRole, recipientId, title, message, type, link })
      ]);
      let timeout;
      await Promise.race([
        delivery,
        new Promise(resolve => { timeout = setTimeout(resolve, 2500); })
      ]);
      if (timeout) clearTimeout(timeout);
    }
    return notification;
  } catch (error) { console.error('Notification create failed:', error.message); return null; }
}
async function notifyAdmins({ type, title, message, link = '', dedupeKey = null }) {
  try {
    const admins = await Fanni.find({ $or: [{ role: 'admin' }, { adminRole: { $in: ['مشرف', 'مشرف أول', 'مدير', 'قراءة فقط'] } }] }).select('_id').lean();
    await Promise.all(admins.map(admin => createNotification({
      recipientRole: 'admin', recipientId: admin._id, type, title, message, link,
      dedupeKey: dedupeKey ? dedupeKey + ':' + String(admin._id) : null
    })));
  } catch (error) { console.error('Admin notification creation failed:', error.message); }
}
module.exports = { createNotification, sendPushNotification, notifyAdmins };
