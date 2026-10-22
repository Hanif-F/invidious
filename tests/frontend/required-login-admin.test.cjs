'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const generated = process.env.FRONTEND_FIXTURES || path.join(__dirname, '.generated');

test('admin access controls show both states and work without JavaScript at mobile widths', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        let fixture = 'preferences-admin.html';
        let submitted;
        await page.route('https://invidious.test/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.method() === 'POST' && url.pathname === '/preferences') {
                submitted = new URLSearchParams(request.postData());
                return route.fulfill({ contentType: 'text/html', body: '<p>Saved</p>' });
            }
            if (url.pathname === '/preferences') return route.fulfill({ contentType: 'text/html', path: path.join(generated, fixture) });
            const asset = path.join(root, 'assets', url.pathname);
            return fs.existsSync(asset) ? route.fulfill({ path: asset }) : route.fulfill({ status: 404 });
        });
        await page.goto('https://invidious.test/preferences');
        const gate = page.getByLabel('Require login:', { exact: true });
        const registration = page.getByLabel('Registration enabled:', { exact: true });
        assert.equal(await gate.isChecked(), false);
        assert.equal(await registration.isChecked(), true);
        assert.match(await page.locator('#registration-enabled-help').innerText(), /user whitelist mode/);
        await gate.check();
        await registration.uncheck();
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        assert.equal(submitted.get('login_required'), 'on');
        assert.equal(submitted.has('registration_enabled'), false);

        fixture = 'preferences-admin-private.html';
        await page.goto('https://invidious.test/preferences');
        assert.equal(await gate.isChecked(), true);
        assert.equal(await registration.isChecked(), false);
        await gate.scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#login-required-help').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.screenshot({ path: '/tmp/invidious-required-login-admin.png' });

        fixture = 'preferences.html';
        await page.goto('https://invidious.test/preferences');
        assert.equal(await page.locator('#login_required').count(), 0);
        assert.equal(await page.locator('#registration_enabled').count(), 0);
    } finally {
        await browser.close();
    }
});
