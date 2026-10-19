'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGINS = 'https://sonaa-backend-v2.vercel.app,http://localhost:3000';

const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const errorHandler = require('../middleware/error');

async function run() {
  let passed = 0;
  async function test(name, fn) {
    await fn();
    passed += 1;
    console.log('✓ ' + name);
  }

  await test('homepage responds and does not expose Express signature', async () => {
    const response = await request(app).get('/');
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-powered-by'], undefined);
  });

  await test('CORS allows the configured production origin', async () => {
    const response = await request(app)
      .options('/api/test')
      .set('Origin', 'https://sonaa-backend-v2.vercel.app')
      .set('Access-Control-Request-Method', 'GET');
    assert.equal(response.headers['access-control-allow-origin'], 'https://sonaa-backend-v2.vercel.app');
  });

  await test('CORS does not reflect an arbitrary origin', async () => {
    const response = await request(app)
      .options('/api/test')
      .set('Origin', 'https://attacker.invalid')
      .set('Access-Control-Request-Method', 'GET');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  });

  await test('error handler hides internal server messages', async () => {
    let statusCode = 200;
    let payload;
    const res = {
      headersSent: false,
      status(code) { statusCode = code; return this; },
      json(body) { payload = body; return this; }
    };
    errorHandler(new Error('mongodb://private-host/secret or JWT_SECRET leaked'), { method: 'GET', originalUrl: '/api/test' }, res, () => {});
    assert.equal(statusCode, 500);
    assert.equal(payload.message, 'حدث خطأ داخلي. حاول مرة أخرى لاحقًا.');
    assert.equal(JSON.stringify(payload).includes('private-host'), false);
    assert.equal(JSON.stringify(payload).includes('JWT_SECRET'), false);
  });

  console.log('Security smoke tests passed: ' + passed);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
