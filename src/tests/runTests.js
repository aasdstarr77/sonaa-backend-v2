'use strict';

// Isolated integration/security suite. Never points at production MongoDB.
process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGINS = 'https://sonaa-backend-v2.vercel.app,http://localhost:3000';
process.env.JWT_SECRET = 'sonaa-test-only-secret-change-me';
process.env.ADMIN_PHONE = '01012345678';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const errorHandler = require('../middleware/error');
const { canAccessAdmin, isRootAdmin, defaultAdminPermissions } = require('../middleware/auth');

async function run() {
  let mongo;
  let mongoose;
  let app;
  let passed = 0;
  const failures = [];
  let clientToken;
  let secondClientToken;
  let clientId;
  let supportCaseId;
  let orderSN;
  let orderClientToken;
  let adminToken;

  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      console.log('✓ ' + name);
    } catch (error) {
      failures.push({ name, error });
      console.error('✗ ' + name + ': ' + (error?.message || error));
    }
  }

  try {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    process.env.MONGO_URI = mongo.getUri('sonaa_test');
    app = require('../server');
    mongoose = require('mongoose');

    await test('only the configured root administrator bypasses the permission matrix', async () => {
      assert.equal(isRootAdmin({ role: 'admin', phone: '01012345678' }), true);
      assert.equal(isRootAdmin({ role: 'admin', phone: '01012345679' }), false);
      assert.equal(canAccessAdmin({ role: 'admin', phone: '01012345679', adminPermissions: { orders: { read: false, write: false } } }, { path: '/orders', method: 'GET' }), true, 'legacy full matrices must not override role defaults');
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مشرف', adminPermissions: { orders: { read: true, write: false } } }, { path: '/api/admin/orders', method: 'GET' }), true);
      assert.equal(canAccessAdmin({ role: 'admin', phone: '01012345679' }, { path: '/settings', method: 'GET' }), false);
    });

    await test('role defaults are restored and manager can publish orders and moderate offers', async () => {
      const readOnly = { role: 'fanni', adminRole: 'قراءة فقط' };
      assert.equal(canAccessAdmin(readOnly, { path: '/orders', method: 'GET' }), true);
      assert.equal(canAccessAdmin(readOnly, { path: '/orders/SN123456/publish', method: 'POST' }), false);
      const manager = { role: 'fanni', adminRole: 'مدير' };
      assert.equal(canAccessAdmin(manager, { path: '/admin/SN123456/publish', method: 'POST' }), true, 'manager must have the dedicated publish permission on the actual mounted route');
      assert.equal(canAccessAdmin(manager, { path: '/admin/SN123456/voice-reviewed', method: 'POST' }), true, 'manager must be able to record the required voice review');
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مشرف' }, { path: '/admin/SN123456/voice-reviewed', method: 'POST' }), false, 'supervisors without publish permission must not mark voice review complete');
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مشرف' }, { path: '/admin/SN123456/publish', method: 'POST' }), false, 'supervisor must not publish by default');
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مدير', adminPermissions: { __customOverrides: true, publishOrders: { read: true, write: false } } }, { path: '/admin/SN123456/publish', method: 'POST' }), false, 'a custom override must revoke publishing without changing order permissions');
      assert.equal(canAccessAdmin(manager, { path: '/offers/SN123456/0/reject', method: 'POST' }), true);
      assert.equal(defaultAdminPermissions('مشرف').orders.write, true);
      assert.equal(defaultAdminPermissions('مشرف').settings.write, false);
      assert.equal(defaultAdminPermissions('مشرف أول').services.write, true);
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مدير' }, { path: '/fanni-profile-edits', method: 'GET' }), true);
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مدير' }, { path: '/fanni-profile-edits/507f1f77bcf86cd799439011/approve', method: 'POST' }), true);
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مشرف' }, { path: '/fanni-profile-edits', method: 'GET' }), true);
      assert.equal(canAccessAdmin({ role: 'fanni', adminRole: 'مشرف' }, { path: '/fanni-profile-edits/507f1f77bcf86cd799439011/approve', method: 'POST' }), false);
    });

    await test('custom admin permissions separate reading from execution and protect permission management', async () => {
      const user = { role: 'fanni', adminRole: 'مشرف', adminPermissions: { __customOverrides: true, orders: { read: true, write: false }, settings: { read: false, write: false } } };
      assert.equal(canAccessAdmin(user, { path: '/orders', method: 'GET' }), true);
      assert.equal(canAccessAdmin(user, { path: '/orders', method: 'POST' }), false);
      assert.equal(canAccessAdmin(user, { path: '/settings', method: 'GET' }), false);
      assert.equal(canAccessAdmin(user, { path: '/reports', method: 'POST' }), true, 'report generation is read-only even though it uses POST');
      const noDashboardRead = { role: 'fanni', adminRole: 'مشرف', adminPermissions: { __customOverrides: true, dashboard: { read: false, write: false } } };
      assert.equal(canAccessAdmin(noDashboardRead, { path: '/reports', method: 'POST' }), false, 'report generation still respects dashboard read permission');
      assert.equal(canAccessAdmin(user, { path: '/admin-users/123/permissions', method: 'PATCH' }), false);
      assert.equal(canAccessAdmin(user, { path: '/notifications/admin', method: 'GET' }), true);
      const adminSource = fs.readFileSync(path.join(__dirname, '../routes/admin/orders.js'), 'utf8');
      const assignStart = adminSource.indexOf("router.post('/orders/:sn/assign'");
      const assignEnd = adminSource.indexOf("router.get('/wallet/transactions", assignStart);
      assert.match(adminSource.slice(assignStart, assignEnd), /requireRootAdmin\(req, res\)/);
      const walletSource = fs.readFileSync(path.join(__dirname, '../routes/admin/wallet.js'), 'utf8');
      const freezeStart = walletSource.indexOf("router.post('/wallet/freeze/:id'");
      const freezeEnd = walletSource.indexOf("\n  return router;", freezeStart);
      assert.notEqual(freezeStart, -1);
      assert.match(walletSource.slice(freezeStart, freezeEnd), /valid\('freeze', 'unfreeze'\)/);
      assert.equal(canAccessAdmin(user, { path: '/notifications/admin/read-all', method: 'PATCH' }), false);
      const noNotificationRead = { role: 'fanni', adminRole: 'مشرف', adminPermissions: { __customOverrides: true, notifications: { read: false, write: false } } };
      assert.equal(canAccessAdmin(noNotificationRead, { path: '/notifications/admin', method: 'GET' }), false);
    });

    await test('wallet balance mutations are governed by wallet permissions, not technician-list permissions', async () => {
      const user = { role: 'fanni', adminRole: 'مدير', adminPermissions: { __customOverrides: true, fannis: { read: false, write: false }, wallet: { read: true, write: true } } };
      assert.equal(canAccessAdmin(user, { path: '/fannis/507f1f77bcf86cd799439011/set-balance', method: 'POST' }), true);
      user.adminPermissions.wallet.write = false;
      assert.equal(canAccessAdmin(user, { path: '/fannis/507f1f77bcf86cd799439011/set-balance', method: 'POST' }), false);
    });

    await test('browser push assets are wired without removing Expo notifications', async () => {
      const webPush = fs.readFileSync(path.join(__dirname, '../utils/webPush.js'), 'utf8');
      const route = fs.readFileSync(path.join(__dirname, '../routes/notifications.js'), 'utf8');
      const browser = fs.readFileSync(path.join(__dirname, '../../frontend/web-push.js'), 'utf8');
      const worker = fs.readFileSync(path.join(__dirname, '../../frontend/service-worker.js'), 'utf8');
      const delivery = fs.readFileSync(path.join(__dirname, '../utils/notifications.js'), 'utf8');
      assert.match(webPush, /aes-128-gcm/); assert.match(webPush, /VAPID_PUBLIC_KEY/);
      const { isAllowedPushEndpoint } = require('../utils/webPush');
      assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true);
      assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true);
      assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/example'), true);
      assert.equal(isAllowedPushEndpoint('https://wns2-example.notify.windows.com/w/?token=example'), true);
      assert.equal(isAllowedPushEndpoint('https://127.0.0.1/admin'), false);
      assert.equal(isAllowedPushEndpoint('https://example.com/push'), false);
      assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.test/push'), false);
      assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/push'), false);
      assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/push'), false);
      assert.match(route, /isAllowedPushEndpoint\(endpoint\)/);
      assert.match(route, /web-subscription/); assert.match(browser, /PushManager/);
      assert.match(worker, /addEventListener\('push'/); assert.match(delivery, /sendPushNotification/);
      assert.match(delivery, /sendWebPushNotification/);
    });
    await test('web push public key endpoint fails safely until VAPID keys are configured', async () => {
      delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
      const r = await request(app).get('/api/notifications/web-push-public-key');
      assert.equal(r.status, 503); assert.match(r.body.message, /غير مهيأة/);
    });

    await test('homepage responds without exposing Express signature', async () => {
      const r = await request(app).get('/');
      assert.equal(r.status, 200);
      assert.equal(r.headers['x-powered-by'], undefined);
    });

    await test('authentication fails safely when JWT_SECRET is missing and missing technician records are checked before guidelines', async () => {
      const originalSecret = process.env.JWT_SECRET;
      try {
        delete process.env.JWT_SECRET;
        const r = await request(app).get('/api/fanni/me')
          .set('Authorization', 'Bearer invalid-token');
        assert.equal(r.status, 503);
      } finally {
        process.env.JWT_SECRET = originalSecret;
      }

      const availableSource = fs.readFileSync(path.join(__dirname, '../routes/order/available.js'), 'utf8');
      assert.ok(
        availableSource.indexOf('if (!fanni)') < availableSource.indexOf('if (!fanni.technicianGuidelinesAcceptedAt'),
        'missing technician record must return 403 before guideline validation'
      );
    });

    await test('security headers include CSP and disable object embedding', async () => {
      const r = await request(app).get('/');
      const csp = r.headers['content-security-policy'] || '';
      assert.ok(csp.includes("object-src 'none'"));
      assert.ok(csp.includes("frame-ancestors 'self'"));
      assert.ok(!csp.includes("https://*.vercel.app"));
      assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
    });

    await test('CSP report-only audits inline scripts without weakening the enforced CSP', async () => {
      const r = await request(app).get('/');
      const enforced = r.headers['content-security-policy'] || '';
      const reportOnly = r.headers['content-security-policy-report-only'] || '';
      assert.ok(enforced.includes("script-src 'self' 'unsafe-inline'"));
      assert.ok(reportOnly.includes("script-src 'self' https://cdn.tailwindcss.com"));
      assert.ok(reportOnly.includes("script-src-attr 'none'"));
      assert.ok(!reportOnly.includes("script-src 'self' 'unsafe-inline'"));
      const report = await request(app).post('/api/csp-report')
        .set('Content-Type', 'application/csp-report')
        .send(JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src-elem', 'document-uri': 'https://sonaa-backend-v2.vercel.app/client.html' } }));
      assert.equal(report.status, 204);
    });

    await test('CORS allows configured production origin', async () => {
      const r = await request(app).options('/api/test')
        .set('Origin', 'https://sonaa-backend-v2.vercel.app')
        .set('Access-Control-Request-Method', 'GET');
      assert.equal(r.headers['access-control-allow-origin'], 'https://sonaa-backend-v2.vercel.app');
    });

    await test('CORS does not reflect an arbitrary origin', async () => {
      const r = await request(app).options('/api/test')
        .set('Origin', 'https://attacker.invalid')
        .set('Access-Control-Request-Method', 'GET');
      assert.equal(r.headers['access-control-allow-origin'], undefined);
    });

    await test('health endpoint confirms isolated database connectivity', async () => {
      const r = await request(app).get('/health');
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.equal(r.body.database, 'connected');
    });

    await test('public services endpoint returns service and category arrays', async () => {
      const r = await request(app).get('/api/services');
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.ok(Array.isArray(r.body.services));
      assert.ok(Array.isArray(r.body.categories));
    });

    await test('public areas endpoint returns an array', async () => {
      const r = await request(app).get('/api/areas');
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.ok(Array.isArray(r.body.areas));
    });

    await test('client registration rejects invalid input', async () => {
      const r = await request(app).post('/api/client/register').send({
        name: 'A', phone: 'not-a-phone', password: '123', confirmPassword: 'different'
      });
      assert.equal(r.status, 400);
    });

    await test('client registration creates a session without exposing password hash', async () => {
      const r = await request(app).post('/api/client/register').send({
        name: 'عميل اختبار', phone: '01012345678',
        password: 'TestPass123', confirmPassword: 'TestPass123'
      });
      assert.equal(r.status, 201);
      assert.ok(r.body.token);
      assert.ok(r.body.client.id);
      assert.equal(r.body.client.passwordHash, undefined);
      clientToken = r.body.token;
      clientId = r.body.client.id;
    });

    await test('duplicate client phone is rejected', async () => {
      const r = await request(app).post('/api/client/register').send({
        name: 'عميل مكرر', phone: '01012345678',
        password: 'TestPass123', confirmPassword: 'TestPass123'
      });
      assert.equal(r.status, 409);
    });

    await test('client login rejects an incorrect password', async () => {
      const r = await request(app).post('/api/client/login').send({
        phone: '01012345678', password: 'WrongPass123'
      });
      assert.equal(r.status, 401);
    });

    await test('client login returns an authenticated session', async () => {
      const r = await request(app).post('/api/client/login').send({
        phone: '01012345678', password: 'TestPass123'
      });
      assert.equal(r.status, 200);
      assert.ok(r.body.token);
      clientToken = r.body.token;
    });

    await test('web push subscription endpoint validates providers and persists/removes only the client subscription', async () => {
      const WebPushSubscription = require('../models/WebPushSubscription');
      const invalid = await request(app).post('/api/notifications/client/web-subscription')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ subscription: { endpoint: 'https://example.com/push', keys: { p256dh: 'test-p256dh', auth: 'test-auth' } } });
      assert.equal(invalid.status, 400, 'untrusted push endpoints must be rejected');

      const endpoint = 'https://fcm.googleapis.com/fcm/send/sonaa-test-subscription';
      const saved = await request(app).post('/api/notifications/client/web-subscription')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ subscription: { endpoint, keys: { p256dh: 'test-p256dh', auth: 'test-auth' } } });
      assert.equal(saved.status, 200);
      const stored = await WebPushSubscription.findOne({ endpoint }).lean();
      assert.ok(stored);
      assert.equal(String(stored.recipientId), String(clientId));
      assert.equal(stored.recipientRole, 'client');

      const removed = await request(app).delete('/api/notifications/client/web-subscription')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ endpoint });
      assert.equal(removed.status, 200);
      assert.equal(removed.body.deleted, 1);
      assert.equal(await WebPushSubscription.countDocuments({ endpoint }), 0);
    });

    await test('technician registration and login preserve pending-review rules and Expo push-token lifecycle', async () => {
      const phone = '01012345681';
      const registration = await request(app).post('/api/fanni/register').send({
        name: 'فني اختبار التسجيل',
        phone,
        password: 'FanniTestPass123',
        specialties: ['صيانة تكييف'],
        areas: ['المعادي']
      });
      assert.equal(registration.status, 201);
      assert.equal(registration.body.status, 'قيد المراجعة');
      assert.equal(registration.body.token, undefined, 'registration must not bypass admin approval');

      const login = await request(app).post('/api/fanni/login').send({
        phone,
        password: 'FanniTestPass123'
      });
      assert.equal(login.status, 200);
      assert.ok(login.body.token);
      assert.equal(login.body.user.status, 'قيد المراجعة');
      assert.equal(login.body.user.passwordHash, undefined);
      const fanniToken = login.body.token;

      const duplicate = await request(app).post('/api/fanni/register').send({
        name: 'فني مكرر',
        phone,
        password: 'FanniTestPass123',
        specialties: ['صيانة تكييف'],
        areas: ['المعادي']
      });
      assert.equal(duplicate.status, 409);

      const wrongPassword = await request(app).post('/api/fanni/login').send({
        phone,
        password: 'WrongFanniPass123'
      });
      assert.equal(wrongPassword.status, 401);

      const PushToken = require('../models/PushToken');
      const expoToken = 'ExponentPushToken[sonaa-phase-two-test-token]';
      const registeredToken = await request(app).post('/api/notifications/fanni/push-token')
        .set('Authorization', 'Bearer ' + fanniToken)
        .send({ token: expoToken, platform: 'android' });
      assert.equal(registeredToken.status, 200);
      const storedToken = await PushToken.findOne({ token: expoToken }).lean();
      assert.ok(storedToken);
      assert.equal(storedToken.recipientRole, 'fanni');

      const removedToken = await request(app).delete('/api/notifications/fanni/push-token')
        .set('Authorization', 'Bearer ' + fanniToken)
        .send({ token: expoToken });
      assert.equal(removedToken.status, 200);
      assert.equal(removedToken.body.deleted, 1);
      assert.equal(await PushToken.countDocuments({ token: expoToken }), 0);
    });

    await test('wallet top-up requests remain pending and never credit balance before admin review', async () => {
      const Fanni = require('../models/Fanni');
      const TopupRequest = require('../models/TopupRequest');
      const jwt = require('jsonwebtoken');
      const fanni = await Fanni.findOne({ phone: '01012345681', role: 'fanni' });
      assert.ok(fanni, 'technician registration fixture must exist');
      const token = jwt.sign({
        id: String(fanni._id), role: 'fanni', tokenVersion: Number(fanni.tokenVersion || 0)
      }, process.env.JWT_SECRET, { expiresIn: '30d' });

      const pending = await request(app).post('/api/fanni/wallet/topup')
        .set('Authorization', 'Bearer ' + token)
        .send({ fromPhone: '01012345682', amount: 100, method: 'vodafone_cash' });
      assert.equal(pending.status, 403, 'pending technicians must not use the wallet');

      fanni.status = 'معتمد';
      await fanni.save();
      const beforeBalance = Number(fanni.walletBalance || 0);
      const invalidSender = await request(app).post('/api/fanni/wallet/topup')
        .set('Authorization', 'Bearer ' + token)
        .send({ fromPhone: 'not-a-phone', amount: 100, method: 'vodafone_cash' });
      assert.equal(invalidSender.status, 400);

      const submitted = await request(app).post('/api/fanni/wallet/topup')
        .set('Authorization', 'Bearer ' + token)
        .send({ fromPhone: '01012345682', amount: 100, method: 'vodafone_cash', reference: 'PHASE2-TEST' });
      assert.equal(submitted.status, 201);
      assert.equal(submitted.body.request.status, 'قيد المراجعة');
      assert.equal(submitted.body.request.isCredited, undefined);
      assert.equal(submitted.body.walletBalance, beforeBalance);

      const storedRequest = await TopupRequest.findById(submitted.body.request.id).lean();
      assert.ok(storedRequest);
      assert.equal(storedRequest.status, 'قيد المراجعة');
      assert.equal(storedRequest.isCredited, false);
      const afterFanni = await Fanni.findById(fanni._id).lean();
      assert.equal(afterFanni.walletBalance, beforeBalance, 'creating a top-up request must not change the wallet balance');

      const history = await request(app).get('/api/fanni/wallet/history')
        .set('Authorization', 'Bearer ' + token);
      assert.equal(history.status, 200);
      assert.ok(history.body.requests.some(item => item.id === String(storedRequest._id)));
    });

    await test('client notifications support unread counts, single-read, read-all, and role isolation', async () => {
      const Notification = require('../models/Notification');
      const own = await Notification.create({
        recipientRole: 'client', recipientId: clientId, type: 'test', title: 'إشعار اختبار',
        message: 'رسالة اختبار', link: '/?tab=orders', readAt: null
      });
      await Notification.create({
        recipientRole: 'fanni', recipientId: clientId, type: 'test', title: 'إشعار فني',
        message: 'يجب ألا يظهر للعميل', link: '/fanni', readAt: null
      });
      const initial = await request(app).get('/api/notifications/client')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(initial.status, 200);
      assert.equal(initial.body.unreadCount, 1);
      assert.ok(initial.body.notifications.some(item => item.id === String(own._id)));
      assert.equal(initial.body.notifications.some(item => item.title === 'إشعار فني'), false);

      const readOne = await request(app).patch('/api/notifications/client/' + own._id + '/read')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(readOne.status, 200);
      const afterSingle = await request(app).get('/api/notifications/client')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(afterSingle.body.unreadCount, 0);

      await Notification.create([
        { recipientRole: 'client', recipientId: clientId, type: 'test', title: 'إشعار 2', message: 'رسالة 2' },
        { recipientRole: 'client', recipientId: clientId, type: 'test', title: 'إشعار 3', message: 'رسالة 3' }
      ]);
      const readAll = await request(app).patch('/api/notifications/client/read-all')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(readAll.status, 200);
      assert.equal(readAll.body.modified, 2);
      const afterAll = await request(app).get('/api/notifications/client')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(afterAll.body.unreadCount, 0);
    });

    await test('second client receives a distinct account', async () => {
      const r = await request(app).post('/api/client/register').send({
        name: 'عميل اختبار ثان', phone: '01012345679',
        password: 'TestPass456', confirmPassword: 'TestPass456'
      });
      assert.equal(r.status, 201);
      assert.notEqual(r.body.client.id, clientId);
      secondClientToken = r.body.token;
    });

    await test('client can change their own password only with the current password', async () => {
      const denied = await request(app).post('/api/password-recovery/change/client')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ currentPassword: 'WrongPass123', newPassword: 'NewPass12345', confirmPassword: 'NewPass12345' });
      assert.equal(denied.status, 400);
      const changed = await request(app).post('/api/password-recovery/change/client')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ currentPassword: 'TestPass123', newPassword: 'NewPass12345', confirmPassword: 'NewPass12345' });
      assert.equal(changed.status, 200);
      assert.ok(changed.body.token);
      const oldSession = await request(app).get('/api/client/me').set('Authorization', 'Bearer ' + clientToken);
      assert.equal(oldSession.status, 401, 'changing a password must revoke the previous client session');
      const returnedSession = await request(app).get('/api/client/me').set('Authorization', 'Bearer ' + changed.body.token);
      assert.equal(returnedSession.status, 200, 'the active device receives a replacement session');
      const login = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'NewPass12345' });
      assert.equal(login.status, 200);
      clientToken = login.body.token;
    });

    await test('support-managed recovery issues a one-time code and resets the client password', async () => {
      const bcrypt = require('bcryptjs');
      const jwt = require('jsonwebtoken');
      const Fanni = require('../models/Fanni');
      const admin = await Fanni.create({
        name: 'مدير الاختبار', phone: '01012345678', passwordHash: await bcrypt.hash('AdminTestPass123', 12),
        specialties: ['إدارة'], areas: ['الإدارة'], status: 'معتمد', role: 'admin'
      });
      adminToken = jwt.sign({ id: String(admin._id), role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

      const adminPasswordChange = await request(app).post('/api/password-recovery/change/admin')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ currentPassword: 'AdminTestPass123', newPassword: 'AdminChangedPass123', confirmPassword: 'AdminChangedPass123' });
      assert.equal(adminPasswordChange.status, 200);
      assert.ok(adminPasswordChange.body.token);
      const oldAdminSession = await request(app).get('/api/admin/me').set('Authorization', 'Bearer ' + adminToken);
      assert.equal(oldAdminSession.status, 401);
      adminToken = adminPasswordChange.body.token;

      const fanni = await Fanni.create({
        name: 'فني اختبار', phone: '01012345680', passwordHash: await bcrypt.hash('FanniOldPass123', 12),
        specialties: ['صيانة تكييف'], areas: ['القاهرة'], status: 'معتمد', role: 'fanni'
      });
      const oldFanniToken = jwt.sign({ id: String(fanni._id), role: 'fanni' }, process.env.JWT_SECRET, { expiresIn: '30d' });
      const fanniPasswordReset = await request(app).patch('/api/admin/fannis/' + fanni._id + '/password')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ newPassword: 'FanniNewPass123', confirmPassword: 'FanniNewPass123' });
      assert.equal(fanniPasswordReset.status, 200);
      const revokedFanniSession = await request(app).get('/api/fanni/me').set('Authorization', 'Bearer ' + oldFanniToken);
      assert.equal(revokedFanniSession.status, 401);
      const fanniNewLogin = await request(app).post('/api/fanni/login').send({ phone: '01012345680', password: 'FanniNewPass123' });
      assert.equal(fanniNewLogin.status, 200);
      const activeFanniSession = await request(app).get('/api/fanni/me').set('Authorization', 'Bearer ' + fanniNewLogin.body.token);
      assert.equal(activeFanniSession.status, 200);

      const oldClientSessionBeforeAdminReset = clientToken;
      const clientAdminReset = await request(app).patch('/api/admin/clients/01012345678/password')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ newPassword: 'AdminResetPass123', confirmPassword: 'AdminResetPass123' });
      assert.equal(clientAdminReset.status, 200);
      const clientSessionAfterAdminReset = await request(app).get('/api/client/me').set('Authorization', 'Bearer ' + oldClientSessionBeforeAdminReset);
      assert.equal(clientSessionAfterAdminReset.status, 401);
      const clientLoginAfterAdminReset = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'AdminResetPass123' });
      assert.equal(clientLoginAfterAdminReset.status, 200);
      clientToken = clientLoginAfterAdminReset.body.token;

      const opened = await request(app).post('/api/password-recovery/request')
        .send({ role: 'client', phone: '01012345678' });
      assert.equal(opened.status, 201);
      assert.ok(opened.body.recoveryToken);
      assert.ok(opened.body.requestId);

      const duplicateRequest = await request(app).post('/api/password-recovery/request')
        .send({ role: 'client', phone: '01012345678' });
      assert.equal(duplicateRequest.status, 409);
      assert.equal(duplicateRequest.body.recoveryToken, undefined, 'a phone-number-only retry must never reveal the existing ticket bearer token');

      const queue = await request(app).get('/api/password-recovery/admin/requests')
        .set('Authorization', 'Bearer ' + adminToken);
      assert.equal(queue.status, 200);
      const item = queue.body.recoveries.find(x => x.id === opened.body.requestId);
      assert.ok(item);

      const adminQuestion = await request(app).post('/api/password-recovery/admin/requests/' + opened.body.requestId + '/reply')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ text: 'من فضلك اذكر تفاصيل تساعدنا على التحقق من ملكية الحساب.' });
      assert.equal(adminQuestion.status, 200);
      assert.equal(adminQuestion.body.recovery.status, 'بانتظار رد المستخدم');
      assert.ok(adminQuestion.body.recovery.messages.some(m => m.text === 'من فضلك اذكر تفاصيل تساعدنا على التحقق من ملكية الحساب.'));

      const userReply = await request(app).post('/api/password-recovery/request/' + opened.body.requestId + '/messages')
        .set('X-Recovery-Token', opened.body.recoveryToken)
        .send({ text: 'هذه بيانات إضافية للتحقق من ملكية الحساب.' });
      assert.equal(userReply.status, 200);
      assert.equal(userReply.body.recovery.status, 'قيد التحقق');
      assert.ok(userReply.body.recovery.messages.some(m => m.text === 'هذه بيانات إضافية للتحقق من ملكية الحساب.'));

      const issued = await request(app).post('/api/password-recovery/admin/requests/' + opened.body.requestId + '/issue-code')
        .set('Authorization', 'Bearer ' + adminToken).send({});
      assert.equal(issued.status, 200);
      assert.match(issued.body.code, /^\d{6}$/);

      const sent = await request(app).post('/api/password-recovery/admin/requests/' + opened.body.requestId + '/reply')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ text: 'رمز استعادة كلمة المرور: ' + issued.body.code });
      assert.equal(sent.status, 200);
      assert.equal(sent.body.recovery.status, 'تم التحقق');
      assert.ok(sent.body.recovery.messages.some(m => String(m.text).includes(issued.body.code)), 'the user-facing support transcript should show the issued code');
      const PasswordRecovery = require('../models/PasswordRecovery');
      const storedRecovery = await PasswordRecovery.findById(opened.body.requestId).lean();
      const storedCodeMessage = storedRecovery.messages.find(m => String(m.text).startsWith('__SONAA_RECOVERY_SECRET_V1__:'));
      assert.ok(storedCodeMessage, 'the code message must be encrypted at rest');
      assert.equal(storedCodeMessage.text.includes(issued.body.code), false);

      const verified = await request(app).post('/api/password-recovery/request/' + opened.body.requestId + '/verify-code')
        .set('X-Recovery-Token', opened.body.recoveryToken).send({ code: issued.body.code });
      assert.equal(verified.status, 200);

      const reset = await request(app).post('/api/password-recovery/request/' + opened.body.requestId + '/reset-password')
        .set('X-Recovery-Token', opened.body.recoveryToken)
        .send({ newPassword: 'RecoveredPass123', confirmPassword: 'RecoveredPass123' });
      assert.equal(reset.status, 200);
      const staleSessionAfterRecovery = await request(app).get('/api/client/me').set('Authorization', 'Bearer ' + clientToken);
      assert.equal(staleSessionAfterRecovery.status, 401, 'support recovery must revoke every previous client session');

      const oldLogin = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'AdminResetPass123' });
      assert.equal(oldLogin.status, 401);
      const newLogin = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'RecoveredPass123' });
      assert.equal(newLogin.status, 200);
      clientToken = newLogin.body.token;
    });

    await test('support endpoints reject unauthenticated users', async () => {
      const r = await request(app).get('/api/support/client');
      assert.equal(r.status, 401);
    });

    await test('client can create a support case and persist its first message', async () => {
      const r = await request(app).post('/api/support/client')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ subject: 'اختبار الدعم', text: 'أحتاج مساعدة في طلب الخدمة' });
      assert.equal(r.status, 201);
      assert.ok(r.body.supportCase._id);
      assert.equal(r.body.supportCase.messages.length, 1);
      assert.equal(r.body.supportCase.messages[0].text, 'أحتاج مساعدة في طلب الخدمة');
      supportCaseId = r.body.supportCase._id;
    });

    await test('client can retrieve their own support case', async () => {
      const r = await request(app).get('/api/support/client/' + supportCaseId)
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(r.status, 200);
      assert.equal(String(r.body.supportCase._id), String(supportCaseId));
    });

    await test('another client cannot read a support case they do not own', async () => {
      const r = await request(app).get('/api/support/client/' + supportCaseId)
        .set('Authorization', 'Bearer ' + secondClientToken);
      assert.equal(r.status, 404);
    });

    await test('empty support message is rejected', async () => {
      const r = await request(app).post('/api/support/client/' + supportCaseId + '/messages')
        .set('Authorization', 'Bearer ' + clientToken).send({ text: '   ' });
      assert.equal(r.status, 400);
    });

    await test('support follow-up message is saved in the same conversation', async () => {
      const r = await request(app).post('/api/support/client/' + supportCaseId + '/messages')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ text: 'هذه رسالة متابعة للاختبار' });
      assert.equal(r.status, 200);
      assert.ok(r.body.supportCase.messages.some(m => m.text === 'هذه رسالة متابعة للاختبار'));
      assert.equal(r.body.supportCase.needsHuman, true, 'owner follow-up should return the case to the human-support queue');
    });

    await test('support admin replies return the case to the user and duplicate opens reuse the same case', async () => {
      const reply = await request(app).post('/api/support/admin/' + supportCaseId + '/reply')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ text: 'تم استلام طلبك وجارٍ متابعة المشكلة.' });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.supportCase.status, 'بانتظار رد المستخدم');
      assert.equal(reply.body.supportCase.needsHuman, false);

      const ownerView = await request(app).get('/api/support/client/' + supportCaseId)
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(ownerView.status, 200);
      assert.ok(ownerView.body.supportCase.messages.some(item => item.text === 'تم استلام طلبك وجارٍ متابعة المشكلة.'));

      const duplicate = await request(app).post('/api/support/client')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ subject: 'طلب دعم مكرر', text: 'رسالة جديدة على المحادثة المفتوحة' });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.existing, true);
      assert.equal(String(duplicate.body.supportCase._id), String(supportCaseId));
    });

    await test('admin button layout is shared, persisted, and safely sanitized', async () => {
      const unauthorized = await request(app).get('/api/admin/ui-layout/admin');
      assert.equal(unauthorized.status, 401);

      const saved = await request(app).put('/api/admin/ui-layout/admin')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ layout: {
          sectionOrder: ['platform-admin', 'dashboard', 'unknown-section', 'dashboard'],
          tabOrder: { dashboard: ['stats', 'orders', 'dashboard', 'not-a-tab'] },
          tabGroups: { orders: 'dashboard', dashboard: 'invalid-section' },
          sizes: { orders: 'large', dashboard: 'tiny', stats: 'small', unknown: 'large' },
          elements: {
            'auto-div-1_button-': {
              width: '29%', buttonWidth: 29, translateX: 12, translateY: -4,
              anchor: 'center', fontSize: 16, color: '#142b43', radius: 10,
              text: 'اختبار العرض', hidden: false, threeD: true, scale: 1
            }
          }
        } });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.layout.sectionOrder, ['platform-admin', 'dashboard']);
      assert.deepEqual(saved.body.layout.tabOrder.dashboard, ['stats', 'orders', 'dashboard']);
      assert.equal(saved.body.layout.tabGroups.orders, 'dashboard');
      assert.equal(saved.body.layout.tabGroups.dashboard, undefined);
      assert.equal(saved.body.layout.sizes.orders, 'large');
      assert.equal(saved.body.layout.sizes.dashboard, undefined);
      assert.equal(saved.body.layout.sizes.stats, 'small');
      assert.equal(saved.body.layout.elements['auto-div-1_button-'].width, '29%');
      assert.equal(saved.body.layout.elements['auto-div-1_button-'].buttonWidth, 29);
      assert.equal(saved.body.layout.elements['auto-div-1_button-'].translateX, 12);
      const loaded = await request(app).get('/api/admin/ui-layout/admin')
        .set('Authorization', 'Bearer ' + adminToken);
      assert.equal(loaded.status, 200);
      assert.deepEqual(loaded.body.layout, saved.body.layout);
      assert.equal(loaded.body.layout.elements['auto-div-1_button-'].width, '29%');
    });

    await test('all five visual-editor layouts preserve version and survive MongoDB save/read round-trips', async () => {
      const AdminConfig = require('../models/AdminConfig');
      for (const page of ['admin', 'client', 'fanni', 'password', 'support']) {
        assert.ok(AdminConfig.schema.paths[page + 'UiLayout'], 'missing MongoDB schema field for ' + page);
        const payload = {
          version: 3, sectionOrder: [], tabOrder: {}, tabGroups: {}, sizes: {},
          elements: {
            ['roundtrip-' + page]: {
              x: 12, y: -8, width: '73%', fontSize: 18,
              color: '#123456', text: 'حفظ واختبار ' + page,
              mobile: { x: 4, y: 6, width: 88, text: 'موبايل' }
            }
          }
        };
        const saved = await request(app).put('/api/admin/ui-layout/' + page)
          .set('Authorization', 'Bearer ' + adminToken).send({ layout: payload });
        assert.equal(saved.status, 200, page + ' save failed: ' + JSON.stringify(saved.body));
        assert.equal(saved.body.layout.version, 3, page + ' version was dropped by sanitizer');
        const loaded = await request(app).get('/api/admin/ui-layout/' + page)
          .set('Authorization', 'Bearer ' + adminToken);
        assert.equal(loaded.status, 200);
        assert.deepEqual(loaded.body.layout, saved.body.layout, page + ' PUT/GET round-trip mismatch');
        const persisted = await AdminConfig.findOne({ key: 'main' }).lean();
        assert.equal(persisted[page + 'UiLayout'].elements['roundtrip-' + page].mobile.width, 88);
      }
    });

    await test('admin API rejects requests without a token', async () => {
      const r = await request(app).get('/api/admin/settings');
      assert.equal(r.status, 401);
    });

    await test('invalid JWT is rejected', async () => {
      const r = await request(app).get('/api/support/client')
        .set('Authorization', 'Bearer definitely-not-a-jwt');
      assert.equal(r.status, 401);
    });

    await test('client token cannot authenticate as a technician', async () => {
      const r = await request(app).get('/api/orders/available')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(r.status, 401);
    });

    await test('order creation rejects an unknown service', async () => {
      const r = await request(app).post('/api/orders')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({
          service: 'خدمة غير موجودة للاختبار', area: 'المعادي',
          address: 'شارع التحرير 10', description: 'أحتاج فني لصيانة الخدمة في المنزل'
        });
      assert.equal(r.status, 400);
    });

    await test('order creation blocks phone numbers embedded in description', async () => {
      const { ALL_SERVICES } = require('../config/professions');
      const r = await request(app).post('/api/orders')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({
          service: ALL_SERVICES[0], area: 'المعادي', address: 'شارع التحرير 10',
          description: 'اتصل بي على 01012345678 من فضلك'
        });
      assert.equal(r.status, 400);
    });

    await test('valid order returns tracking code and omits customer phone from public payload', async () => {
      const { ALL_SERVICES } = require('../config/professions');
      const r = await request(app).post('/api/orders')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({
          service: ALL_SERVICES[0], area: 'المعادي', address: 'شارع التحرير 10',
          description: 'أحتاج فني لصيانة الخدمة في المنزل'
        });
      assert.equal(r.status, 201);
      assert.match(r.body.sn, /^SN\d{6}$/);
      assert.ok(r.body.clientToken);
      assert.equal(r.body.order.clientPhone, undefined);
      assert.equal(r.body.order.phone, undefined);
      assert.equal(r.body.order.status, 'قيد المراجعة');
      orderSN = r.body.sn;
      orderClientToken = r.body.clientToken;
    });

    await test('published order offer, client acceptance, wallet commission ledger, and accepted chat work end to end', async () => {
      const { ALL_SERVICES } = require('../config/professions');
      const Fanni = require('../models/Fanni');
      const Order = require('../models/Order');
      const WalletTransaction = require('../models/WalletTransaction');
      const jwt = require('jsonwebtoken');
      const service = ALL_SERVICES[0];
      const fanni = await Fanni.findOne({ phone: '01012345680', role: 'fanni' });
      assert.ok(fanni, 'approved technician fixture must exist');
      fanni.status = 'معتمد';
      fanni.specialties = [service];
      fanni.walletBalance = 1000;
      fanni.technicianGuidelinesAcceptedAt = new Date();
      fanni.technicianGuidelinesVersion = '2026-10-20-v1';
      await fanni.save();
      const fanniToken = jwt.sign({
        id: String(fanni._id),
        role: 'fanni',
        tokenVersion: Number(fanni.tokenVersion || 0)
      }, process.env.JWT_SECRET, { expiresIn: '30d' });

      const created = await request(app).post('/api/orders')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({
          service, area: 'المعادي', address: 'شارع الاختبار 12',
          description: 'طلب مستقل لاختبار العرض والقبول والمحادثة'
        });
      assert.equal(created.status, 201);
      const order = await Order.findOne({ sn: created.body.sn });
      assert.ok(order);
      order.status = 'تم النشر';
      order.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await order.save();

      const offer = await request(app).post('/api/fanni/orders/' + order.sn + '/offer')
        .set('Authorization', 'Bearer ' + fanniToken)
        .send({ price: 500, message: 'أستطيع تنفيذ الخدمة في الموعد المناسب.' });
      assert.equal(offer.status, 201);
      assert.equal(offer.body.orderSn, order.sn);
      assert.equal(offer.body.walletBalance, 1000, 'submitting an offer must not deduct commission');
      const savedOrder = await Order.findOne({ sn: order.sn });
      assert.equal(savedOrder.status, 'وصلتك عروض');
      assert.equal(savedOrder.offers.length, 1);
      const offerId = String(savedOrder.offers[0]._id);
      assert.equal(offer.body.offers[0].fanniPhone, undefined, 'technician offer responses must omit the phone field');
      const clientOrders = await request(app).get('/api/client/orders')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(clientOrders.status, 200);
      const clientView = clientOrders.body.orders.find(item => item.sn === order.sn);
      assert.ok(clientView);
      assert.equal(clientView.offers[0].fanniPhone, undefined, 'client dashboards must not receive technician phone numbers before acceptance');

      const accepted = await request(app).post('/api/orders/' + order.sn + '/accept')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ offerId });
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body.order.status, 'تم اختيار فني');
      assert.equal(accepted.body.order.commissionAmount, undefined, 'commission internals must not leak in the client response');

      const updatedFanni = await Fanni.findById(fanni._id).lean();
      assert.equal(updatedFanni.walletBalance, 950, 'acceptance must atomically deduct the 10% commission');
      const transaction = await WalletTransaction.findOne({ order: order._id, type: 'commission' }).lean();
      assert.ok(transaction);
      assert.equal(transaction.amount, -50);
      assert.equal(transaction.balanceBefore, 1000);
      assert.equal(transaction.balanceAfter, 950);

      const clientChat = await request(app).get('/api/orders/' + order.sn + '/chat')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(clientChat.status, 200);
      const fanniChat = await request(app).get('/api/orders/' + order.sn + '/chat')
        .set('Authorization', 'Bearer ' + fanniToken);
      assert.equal(fanniChat.status, 200);

      const sentByFanni = await request(app).post('/api/orders/' + order.sn + '/chat')
        .set('Authorization', 'Bearer ' + fanniToken)
        .send({ text: 'تم تحديد موعد الزيارة.' });
      assert.equal(sentByFanni.status, 201);
      const sentByClient = await request(app).post('/api/orders/' + order.sn + '/chat')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ text: 'شكرًا، في انتظارك.' });
      assert.equal(sentByClient.status, 201);
      const finalChat = await request(app).get('/api/orders/' + order.sn + '/chat')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.ok(finalChat.body.messages.some(message => message.text === 'تم تحديد موعد الزيارة.'));
      assert.ok(finalChat.body.messages.some(message => message.text === 'شكرًا، في انتظارك.'));
    });

    await test('order chat rejects revoked technician sessions after password changes', async () => {
      const Fanni = require('../models/Fanni');
      const Order = require('../models/Order');
      const jwt = require('jsonwebtoken');
      const fanni = await Fanni.findOne({ phone: '01012345680', role: 'fanni' });
      assert.ok(fanni, 'technician fixture must exist');
      fanni.technicianGuidelinesAcceptedAt = new Date();
      fanni.technicianGuidelinesVersion = 'test-v1';
      await fanni.save();

      const order = await Order.findOne({ sn: orderSN });
      assert.ok(order);
      const originalStatus = order.status;
      const originalAssignedFanni = order.assignedFanni;
      const originalOffers = order.offers.map(item => item.toObject());
      const originalMessages = order.chatMessages.map(item => item.toObject());
      try {
        order.status = 'وصلتك عروض';
        order.offers.push({ fanni: fanni._id, fanniName: fanni.name, price: '500', priceNum: 500 });
        await order.save();
        const offerId = String(order.offers[order.offers.length - 1]._id);
        const oldTokenVersion = Number(fanni.tokenVersion || 0);
        const oldToken = jwt.sign({ id: String(fanni._id), role: 'fanni', tokenVersion: oldTokenVersion }, process.env.JWT_SECRET, { expiresIn: '30d' });

        const beforeRevocation = await request(app).get('/api/orders/' + orderSN + '/chat')
          .set('Authorization', 'Bearer ' + oldToken);
        assert.equal(beforeRevocation.status, 200);
        const sentBeforeRevocation = await request(app).post('/api/orders/' + orderSN + '/chat')
          .set('Authorization', 'Bearer ' + oldToken).send({ offerId, text: 'نعم' });
        assert.equal(sentBeforeRevocation.status, 201);

        fanni.tokenVersion = oldTokenVersion + 1;
        await fanni.save();
        const staleRead = await request(app).get('/api/orders/' + orderSN + '/chat')
          .set('Authorization', 'Bearer ' + oldToken);
        assert.equal(staleRead.status, 403, 'revoked technician token must not read chat history');
        const staleWrite = await request(app).post('/api/orders/' + orderSN + '/chat')
          .set('Authorization', 'Bearer ' + oldToken).send({ offerId, text: 'نعم' });
        assert.equal(staleWrite.status, 403, 'revoked technician token must not send chat messages');

        const currentToken = jwt.sign({ id: String(fanni._id), role: 'fanni', tokenVersion: Number(fanni.tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: '30d' });
        const currentRead = await request(app).get('/api/orders/' + orderSN + '/chat')
          .set('Authorization', 'Bearer ' + currentToken);
        assert.equal(currentRead.status, 200, 'a current technician session must retain chat access');

        order.status = 'تم الانتهاء';
        order.assignedFanni = fanni._id;
        await order.save();
        const revokedRating = await request(app).post('/api/orders/' + orderSN + '/rating')
          .set('Authorization', 'Bearer ' + oldToken)
          .send({ stars: 1, comment: 'تقييم بجلسة ملغاة' });
        assert.equal(revokedRating.status, 401, 'revoked technician sessions must not submit ratings');

        const currentRating = await request(app).post('/api/orders/' + orderSN + '/rating')
          .set('Authorization', 'Bearer ' + currentToken)
          .send({ stars: 5, comment: 'تقييم بجلسة سارية' });
        assert.equal(currentRating.status, 201, 'the assigned technician with a current session can still rate');
      } finally {
        const orderToRestore = await Order.findOne({ sn: orderSN });
        if (orderToRestore) {
          orderToRestore.status = originalStatus;
          orderToRestore.assignedFanni = originalAssignedFanni;
          orderToRestore.offers = originalOffers;
          orderToRestore.chatMessages = originalMessages;
          await orderToRestore.save();
        }
      }
    });

    await test('client order responses collapse historical duplicate offers from the same technician', async () => {
      const { ALL_SERVICES } = require('../config/professions');
      const created = await request(app).post('/api/orders')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({
          service: ALL_SERVICES[0], area: 'المعادي', address: 'شارع التحرير 10',
          description: 'أحتاج فني لاختبار منع تكرار العروض'
        });
      assert.equal(created.status, 201);
      const Order = require('../models/Order');
      const order = await Order.findOne({ sn: created.body.sn });
      assert.ok(order);
      const technicianId = new mongoose.Types.ObjectId();
      const duplicateOffer = {
        fanni: technicianId,
        fanniId: String(technicianId),
        fanniName: 'فني اختبار',
        price: '250',
        priceNum: 250,
        message: 'عرض تجريبي'
      };
      order.offers.push({ ...duplicateOffer }, { ...duplicateOffer });
      await order.save();

      const response = await request(app).get('/api/client/orders')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(response.status, 200);
      const visibleOrder = response.body.orders.find(item => item.sn === created.body.sn);
      assert.ok(visibleOrder);
      assert.equal(visibleOrder.offers.length, 1);
      assert.equal(visibleOrder.offers[0].fanniName, 'فني اختبار');
    });

    await test('offer submission uses an atomic guard against concurrent duplicate offers', async () => {
      const source = fs.readFileSync(path.join(__dirname, '../routes/order/offers.js'), 'utf8');
      const offerStart = source.indexOf("router.post('/:sn/offer'");
      const offerEnd = source.indexOf("\n  return router;", offerStart);
      assert.notEqual(offerStart, -1);
      assert.notEqual(offerEnd, -1);
      const offerRoute = source.slice(offerStart, offerEnd);
      assert.match(offerRoute, /Order\.findOneAndUpdate\(/);
      assert.match(offerRoute, /'offers\.fanni': \{ \$ne: req\.userId \}/);
      assert.match(offerRoute, /\$push: \{ offers: offerPayload \}/);
      assert.match(offerRoute, /سبق أن أرسلت عرضًا لهذا الطلب/);
    });

    await test('account owner can retrieve linked orders without exposing platform commission', async () => {
      const r = await request(app).get('/api/orders/' + orderSN)
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(r.status, 200);
      const staleStandaloneToken = await request(app).get('/api/orders/' + orderSN)
        .query({ clientToken: orderClientToken });
      assert.equal(staleStandaloneToken.status, 200, 'a token issued for this account-bound order remains compatible with the client UI');
      assert.equal(r.body.order.sn, orderSN);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionRate'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionAmount'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionCharged'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionChargedAt'), false);
      const source = fs.readFileSync(path.join(__dirname, '../routes/order/lifecycle.js'), 'utf8');
      const acceptStart = source.indexOf("router.post('/:sn/accept'");
      const acceptEnd = source.indexOf("router.post('/:sn/cancel'", acceptStart);
      assert.notEqual(acceptStart, -1);
      assert.notEqual(acceptEnd, -1);
      const acceptRoute = source.slice(acceptStart, acceptEnd);
      assert.doesNotMatch(acceptRoute, /responsePayload\s*=\s*\{[\s\S]{0,250}commission\s*:/);
      assert.match(acceptRoute, /message: 'تم قبول العرض بنجاح'/);
      assert.match(acceptRoute, /notificationCommissionAmount = commissionAmount/);
      assert.match(acceptRoute, /notificationCommissionRate = commissionRate/);
      assert.doesNotMatch(acceptRoute, /responsePayload\.commission\?\./);
      const chatSource = fs.readFileSync(path.join(__dirname, '../routes/order/chat.js'), 'utf8');
      assert.match(chatSource, /تمت الموافقة على السعر الجديد\./);
      assert.match(chatSource, /typeof req\.body\?\.approved !== 'boolean'/);
      assert.match(chatSource, /const chatMessageLimiter = rateLimit/);
      assert.match(chatSource, /router\.post\('\/:sn\/chat', chatMessageLimiter,/);
    });

    await test('suspended clients lose access through old JWTs and order-bound tokens', async () => {
      const Client = require('../models/Client');
      const client = await Client.findById(clientId);
      assert.ok(client);
      client.status = 'معلق';
      await client.save();

      const trackedWithOldSession = await request(app).get('/api/orders/' + orderSN)
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(trackedWithOldSession.status, 403);

      const chatWithOldSession = await request(app).get('/api/orders/' + orderSN + '/chat')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(chatWithOldSession.status, 403);

      const claimedOrderToken = await request(app).get('/api/orders/' + orderSN)
        .query({ clientToken: orderClientToken });
      assert.equal(claimedOrderToken.status, 403, 'a standalone tracking token must stop working after the order is linked to an account');

      client.status = 'نشط';
      await client.save();
    });

    await test('claiming a legacy order revokes its standalone tracking token', async () => {
      const Order = require('../models/Order');
      const jwt = require('jsonwebtoken');
      const legacy = await Order.create({
        sn: 'SN999998',
        service: 'صيانة تكييف',
        area: 'مدينة نصر',
        clientName: 'عميل اختبار قديم',
        clientPhone: '01012345678',
        description: 'طلب قديم لاختبار ربطه بحساب العميل',
        status: 'قيد المراجعة'
      });
      const legacyToken = jwt.sign({
        purpose: 'client-order',
        orderId: String(legacy._id),
        sn: legacy.sn
      }, process.env.JWT_SECRET, { expiresIn: '30d' });

      const beforeClaim = await request(app).get('/api/orders/' + legacy.sn)
        .query({ clientToken: legacyToken });
      assert.equal(beforeClaim.status, 200, 'legacy standalone token remains usable before account claim');

      const claimed = await request(app).post('/api/client/orders/claim')
        .set('Authorization', 'Bearer ' + clientToken)
        .send({ sn: legacy.sn, clientToken: legacyToken });
      assert.equal(claimed.status, 200);

      const oldTokenAccess = await request(app).get('/api/orders/' + legacy.sn)
        .query({ clientToken: legacyToken });
      assert.equal(oldTokenAccess.status, 403);

      const accountAccess = await request(app).get('/api/orders/' + legacy.sn)
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(accountAccess.status, 200);
    });

    await test('only the order owner can cancel a pending order', async () => {
      const denied = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + secondClientToken);
      assert.equal(denied.status, 403);

      const cancelled = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.order.status, 'ملغي');

      const repeated = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + clientToken);
      assert.equal(repeated.status, 409);

      const lifecycleSource = fs.readFileSync(path.join(__dirname, '../routes/order/lifecycle.js'), 'utf8');
      const cancelStart = lifecycleSource.indexOf("router.post('/:sn/cancel'");
      const cancelEnd = lifecycleSource.indexOf("router.post('/:sn/complete'", cancelStart);
      assert.notEqual(cancelStart, -1);
      assert.notEqual(cancelEnd, -1);
      const cancelRoute = lifecycleSource.slice(cancelStart, cancelEnd);
      assert.match(cancelRoute, /Order\.findOneAndUpdate\(/, 'cancellation must use an atomic conditional update');
      assert.match(cancelRoute, /assignedFanni:\s*null/, 'cancellation must lose the race if a technician was assigned');
      assert.doesNotMatch(cancelRoute, /order\.save\(\)/, 'a stale document save must not overwrite an accepted offer');
    });

    await test('tracking code alone does not expose order details', async () => {
      const r = await request(app).get('/api/orders/' + orderSN);
      assert.equal(r.status, 403);
    });

    await test('CORS preflight permits the recovery-ticket header for configured frontend origins', async () => {
      const r = await request(app).options('/api/password-recovery/request/test/messages')
        .set('Origin', 'https://sonaa-backend-v2.vercel.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-recovery-token');
      assert.equal(r.status, 204);
      assert.match(String(r.headers['access-control-allow-headers'] || ''), /x-recovery-token/i);
    });

    await test('unknown API route returns JSON 404', async () => {
      const r = await request(app).get('/api/route-that-does-not-exist');
      assert.equal(r.status, 404);
      assert.equal(r.body.message, 'مسار API غير موجود');
    });

    await test('error handler hides internal server details', async () => {
      let statusCode = 200;
      let payload;
      const res = {
        headersSent: false,
        status(code) { statusCode = code; return this; },
        json(body) { payload = body; return this; }
      };
      errorHandler(
        new Error('mongodb://private-host/secret or JWT_SECRET leaked'),
        { method: 'GET', originalUrl: '/api/test' }, res, () => {}
      );
      assert.equal(statusCode, 500);
      assert.equal(payload.message, 'حدث خطأ داخلي. حاول مرة أخرى لاحقًا.');
      assert.equal(JSON.stringify(payload).includes('private-host'), false);
      assert.equal(JSON.stringify(payload).includes('JWT_SECRET'), false);
    });
  } finally {
    if (mongoose) {
      try { await mongoose.disconnect(); } catch (_) {}
    }
    if (mongo) {
      try { await mongo.stop(); } catch (_) {}
    }
  }

  console.log('\nIntegration/security tests: ' + passed + ' passed, ' + failures.length + ' failed.');
  if (failures.length) {
    for (const failure of failures) {
      console.error('\nFAILED: ' + failure.name);
      console.error(failure.error?.stack || failure.error);
    }
  }

  // All tests and MongoDB cleanup have completed. Do not let unrelated
  // background handles keep the CI process alive.
  const exitCode = failures.length ? 1 : 0;
  process.exitCode = exitCode;
  await new Promise(resolve => process.stdout.write('', resolve));
  process.exit(exitCode);
}

run().catch(error => {
  console.error('Test runner failed before completing:', error);
  process.stdout.write('', () => process.exit(1));
});
