'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'sonaa-browser-isolated-test-secret';
process.env.ADMIN_PHONE = '01012345678';
process.env.ADMIN_EMAIL = 'admin.smoke@example.com';
process.env.ADMIN_PASSWORD = 'AdminSmokePass123';
process.env.ADMIN_NAME = 'إدارة اختبار المتصفح';
process.env.ADMIN_SETUP_SECRET = 'sonaa-browser-setup-secret-at-least-32-chars';
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:4173';
process.env.PORT = process.env.PORT || '4173';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');

(async () => {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });

  process.env.MONGO_URI = mongo.getUri('sonaa_browser_test');

  const app = require('../src/server');
  const mongoose = require('mongoose');

  const client = await request(app).post('/api/client/register').send({
    name: 'عميل اختبار المتصفح',
    phone: '01012345670',
    password: 'ClientSmokePass123',
    confirmPassword: 'ClientSmokePass123'
  });
  if (client.status !== 201) throw new Error('Unable to seed browser-test client: HTTP ' + client.status);

  const technician = await request(app).post('/api/fanni/register').send({
    name: 'فني اختبار المتصفح',
    phone: '01012345671',
    password: 'FanniSmokePass123',
    specialties: ['صيانة تكييف'],
    areas: ['المعادي']
  });
  if (technician.status !== 201) throw new Error('Unable to seed browser-test technician: HTTP ' + technician.status);

  const admin = await request(app).post('/api/admin/bootstrap').send({
    secret: process.env.ADMIN_SETUP_SECRET
  });
  if (admin.status !== 201) throw new Error('Unable to seed browser-test admin: HTTP ' + admin.status);

  const adminLogin = await request(app).post('/api/admin/login').send({
    phone: process.env.ADMIN_PHONE,
    password: process.env.ADMIN_PASSWORD
  });
  if (adminLogin.status !== 200 || !adminLogin.body.token) {
    throw new Error('Seeded browser-test admin login failed: HTTP ' + adminLogin.status);
  }

  const server = app.listen(Number(process.env.PORT), () => {
    console.log('Isolated Sonaa browser-test server ready on port ' + process.env.PORT);
  });

  async function shutdown() {
    server.close();
    await mongoose.disconnect().catch(() => {});
    await mongo.stop().catch(() => {});
  }

  process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));
  process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
})().catch(error => {
  console.error('Browser-test server failed:', error);
  process.exit(1);
});
