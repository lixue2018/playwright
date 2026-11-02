// @ts-check
/**
 * 后台 UI 登录 — 翻译自 AT_py 后台 admin_login 流程
 * Vue：csl-new-ui/src/views/login.vue
 */
const { test, expect } = require('@playwright/test');
const { ACCOUNTS } = require('../utils/accounts');

test.describe('后台登录（UI）', () => {
  test('超管 itCode 登录进入 admin index', async ({ page }) => {
    const itCode = ACCOUNTS.superAdmin;

    await page.goto('/admin/login?redirect=/index');

    const account = page
      .getByPlaceholder(/itCode|ItCode|账号/i)
      .or(page.locator('.login-form input[type="text"]').first());

    await expect(account).toBeVisible();
    await account.fill(itCode);

    // 后台页可用回车提交；同时兼容显式点登录按钮
    const loginBtn = page.getByRole('button', { name: /登录/ });
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
    } else {
      await account.press('Enter');
    }

    await expect(page).toHaveURL(/\/admin\/index/, { timeout: 30_000 });
  });
});
