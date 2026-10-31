'use strict';

const { chromium } = require('playwright');

const BASE = process.env.SONAA_SMOKE_BASE || 'http://127.0.0.1:4173';
const pages = [
  { path: '/index.html', name: 'home' },
  { path: '/client.html', name: 'client' },
  { path: '/fanni.html', name: 'technician' },
  { path: '/admin.html', name: 'admin' },
  { path: '/password.html?role=client', name: 'password' },
  { path: '/support.html', name: 'support' },
  { path: '/admin-setup.html', name: 'admin-setup' }
];

function apiResponse(pathname) {
  if (pathname.endsWith('/services')) {
    return { categories: [{ label: 'اختبار', services: ['كهرباء'] }], services: ['كهرباء'] };
  }
  if (pathname.endsWith('/areas')) return { areas: ['القاهرة', 'الجيزة'] };
  if (pathname.endsWith('/content')) return { content: [] };
  if (pathname.endsWith('/wallet-settings')) return {};
  if (pathname.includes('/notifications')) return { notifications: [], unreadCount: 0 };
  if (pathname.includes('/page-visits')) return { ok: true };
  return { ok: true, data: [], requests: [], cases: [], recoveries: [] };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const overflow = [];

  try {
    for (const viewport of [
      { name: 'desktop', width: 1365, height: 900 },
      { name: 'mobile', width: 360, height: 800 }
    ]) {
      for (const target of pages) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        const pageErrors = [];
        const badLocalResponses = [];

        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('response', response => {
          const url = new URL(response.url());
          if (url.origin === BASE && (response.status() === 404 || response.status() >= 500)) {
            badLocalResponses.push(response.status() + ' ' + url.pathname);
          }
        });

        if (process.env.SONAA_SMOKE_REAL_API !== '1') {
          await page.route('**/api/**', async route => {
            const url = new URL(route.request().url());
            await route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify(apiResponse(url.pathname))
            });
          });
        }

        try {
          const response = await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
          if (!response || response.status() !== 200) {
            failures.push(target.name + '/' + viewport.name + ': page did not return HTTP 200');
          }
          await page.waitForTimeout(900);

          if (target.name !== 'home' && !await page.locator('#app, #setupForm, #main, main.wrap').count()) {
            failures.push(target.name + '/' + viewport.name + ': expected page root was not rendered');
          }

          const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth
          }));
          if (dimensions.document > dimensions.viewport + 2) {
            overflow.push(target.name + '/' + viewport.name + ': ' + dimensions.document + 'px content in ' + dimensions.viewport + 'px viewport');
          }

          if (viewport.name === 'desktop') {
            if (target.name === 'client') {
              await page.locator('#accountPhone').fill('123');
              await page.locator('#accountPassword').fill('x');
              await page.locator('.account-submit').click();
              await page.getByText('رقم الموبايل غير صحيح؛ اكتب 11 رقمًا يبدأ بـ 01.').waitFor({ state: 'visible', timeout: 3000 });
              if (process.env.SONAA_SMOKE_REAL_API === '1') {
                await page.locator('#accountPhone').fill('01012345670');
                await page.locator('#accountPassword').fill('ClientSmokePass123');
                await page.locator('.account-submit').click();
                await page.waitForFunction(() => !!localStorage.getItem('sonaa_client_account_token'), { timeout: 10000 });
              }
            } else if (target.name === 'technician') {
              await page.locator('#fanniLoginPhone').fill('123');
              await page.locator('#fanniLoginPassword').fill('x');
              await page.getByRole('button', { name: 'دخول إلى حسابي' }).click();
              await page.getByText('رقم التليفون غير صحيح').waitFor({ state: 'visible', timeout: 3000 });
              if (process.env.SONAA_SMOKE_REAL_API === '1') {
                await page.locator('#fanniLoginPhone').fill('01012345671');
                await page.locator('#fanniLoginPassword').fill('FanniSmokePass123');
                await page.getByRole('button', { name: 'دخول إلى حسابي' }).click();
                await page.waitForFunction(() => !!localStorage.getItem('fanni_token_v4'), { timeout: 10000 });
              }
            } else if (target.name === 'admin') {
              await page.locator('#login-btn').click();
              await page.getByText('اكتب البيانات').waitFor({ state: 'visible', timeout: 3000 });
            }
          }

          if (pageErrors.length) failures.push(target.name + '/' + viewport.name + ': ' + pageErrors.join(' | '));
          if (badLocalResponses.length) failures.push(target.name + '/' + viewport.name + ': ' + badLocalResponses.join(', '));
        } catch (error) {
          failures.push(target.name + '/' + viewport.name + ': ' + error.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (overflow.length) {
    console.log('RESPONSIVE OVERFLOW WARNINGS:');
    for (const item of overflow) console.log('- ' + item);
  }

  if (failures.length) {
    console.error('FRONTEND BROWSER SMOKE TESTS FAILED:');
    for (const item of failures) console.error('- ' + item);
    process.exitCode = 1;
  } else {
    console.log('Frontend browser smoke tests passed: ' + pages.length + ' pages x 2 viewports = ' + (pages.length * 2) + ' page loads.');
    console.log('Responsive overflow warnings: ' + overflow.length);
  }
})();
