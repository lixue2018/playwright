// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { FRONT_BASE_URL, ADMIN_BASE_URL, AUTH_DIR } = require('../utils/env');
const { frontOwner, superAdmin } = require('../utils/accounts');
const { fetchAccessToken, injectFrontAuth, injectAdminAuth } = require('../utils/api-helper');

fs.mkdirSync(AUTH_DIR, { recursive: true });

test('前台接口人 storageState', async ({ page, request }) => {
  const token = await fetchAccessToken(request, frontOwner());
  await injectFrontAuth(page, token);
  await page.goto(`${FRONT_BASE_URL}/workbench`);
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.context().storageState({ path: path.join(AUTH_DIR, 'front-owner.json') });
});

test('后台超管 storageState', async ({ page, request }) => {
  const token = await fetchAccessToken(request, superAdmin());
  await injectAdminAuth(page, token);
  await page.goto(`${ADMIN_BASE_URL}/admin/index`);
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.context().storageState({ path: path.join(AUTH_DIR, 'super-admin.json') });
});
