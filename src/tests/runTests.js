'use strict';

// Isolated integration/security suite. Never points at production MongoDB.
process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGINS = 'https://sonaa-backend-v2.vercel.app,http://localhost:3000';
process.env.JWT_SECRET = 'sonaa-test-only-secret-change-me';
process.env.ADMIN_PHONE = '01012345678';

const assert = require('node:assert/strict');
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
      assert.equal(canAccessAdmin(manager, { path: '/orders/SN123456/publish', method: 'POST' }), true);
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
      assert.equal(canAccessAdmin(user, { path: '/admin-users/123/permissions', method: 'PATCH' }), false);
    });

    await test('wallet balance mutations are governed by wallet permissions, not technician-list permissions', async () => {
      const user = { role: 'fanni', adminRole: 'مدير', adminPermissions: { __customOverrides: true, fannis: { read: false, write: false }, wallet: { read: true, write: true } } };
      assert.equal(canAccessAdmin(user, { path: '/fannis/507f1f77bcf86cd799439011/set-balance', method: 'POST' }), true);
      user.adminPermissions.wallet.write = false;
      assert.equal(canAccessAdmin(user, { path: '/fannis/507f1f77bcf86cd799439011/set-balance', method: 'POST' }), false);
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
      assert.ok(csp.includes("frame-ancestors 'none'"));
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

    await test('matching tracking token can retrieve its order', async () => {
      const r = await request(app).get('/api/orders/' + orderSN)
        .query({ clientToken: orderClientToken });
      assert.equal(r.status, 200);
      assert.equal(r.body.order.sn, orderSN);
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
    process.exitCode = 1;
    for (const failure of failures) {
      console.error('\nFAILED: ' + failure.name);
      console.error(failure.error?.stack || failure.error);
    }
  }
}

run().catch(error => {
  console.error('Test runner failed before completing:', error);
  process.exitCode = 1;
});
