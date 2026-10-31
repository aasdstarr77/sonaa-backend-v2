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
const { MongoMemoryServer } = require('mongodb-memory-server');
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
    mongo = await MongoMemoryServer.create();
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

      const opened = await request(app).post('/api/password-recovery/request')
        .send({ role: 'client', phone: '01012345678' });
      assert.equal(opened.status, 201);
      assert.ok(opened.body.recoveryToken);
      assert.ok(opened.body.requestId);

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

      const oldLogin = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'NewPass12345' });
      assert.equal(oldLogin.status, 401);
      const newLogin = await request(app).post('/api/client/login').send({ phone: '01012345678', password: 'RecoveredPass123' });
      assert.equal(newLogin.status, 200);
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
      // Offer submission now lives in its feature module after the route split.
      const source = fs.readFileSync(path.join(__dirname, '../routes/order/technician-discovery.js'), 'utf8');
      const offerStart = source.indexOf("router.post('/:sn/offer'");
      assert.notEqual(offerStart, -1);
      const offerRoute = source.slice(offerStart);
      assert.match(offerRoute, /Order\.findOneAndUpdate\(/);
      assert.match(offerRoute, /'offers\.fanni': \{ \$ne: req\.userId \}/);
      assert.match(offerRoute, /\$push: \{ offers: offerPayload \}/);
      assert.match(offerRoute, /سبق أن أرسلت عرضًا لهذا الطلب/);
    });

    await test('matching tracking token can retrieve its order without exposing platform commission', async () => {
      const r = await request(app).get('/api/orders/' + orderSN)
        .query({ clientToken: orderClientToken });
      assert.equal(r.status, 200);
      assert.equal(r.body.order.sn, orderSN);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionRate'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionAmount'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionCharged'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(r.body.order, 'commissionChargedAt'), false);
      // Acceptance and price-change decisions were moved into separate feature modules.
      const lifecycleSource = fs.readFileSync(path.join(__dirname, '../routes/order/lifecycle.js'), 'utf8');
      const acceptStart = lifecycleSource.indexOf("router.post('/:sn/accept'");
      const acceptEnd = lifecycleSource.indexOf("router.post('/:sn/cancel'", acceptStart);
      assert.notEqual(acceptStart, -1);
      assert.notEqual(acceptEnd, -1);
      const acceptRoute = lifecycleSource.slice(acceptStart, acceptEnd);
      assert.doesNotMatch(acceptRoute, /responsePayload\s*=\s*\{[\s\S]{0,250}commission\s*:/);
      assert.match(acceptRoute, /message: 'تم قبول العرض بنجاح'/);
      const priceSource = fs.readFileSync(path.join(__dirname, '../routes/order/chat-and-price.js'), 'utf8');
      assert.match(priceSource, /تمت الموافقة على السعر الجديد\./);
    });

    await test('only the order owner can cancel a pending order', async () => {
      const denied = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + secondClientToken);
      assert.equal(denied.status, 403);

      const cancelled = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + orderClientToken);
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.order.status, 'ملغي');

      const repeated = await request(app).post('/api/orders/' + orderSN + '/cancel')
        .set('Authorization', 'Bearer ' + orderClientToken);
      assert.equal(repeated.status, 409);
    });

    await test('tracking code alone does not expose order details', async () => {
      const r = await request(app).get('/api/orders/' + orderSN);
      assert.equal(r.status, 403);
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
