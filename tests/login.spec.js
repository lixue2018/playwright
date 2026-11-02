// @ts-check
/**
 * 前台 UI 登录 — 翻译自 AT_py common/stages/stage1_create_project.py · run_login
 *
 * 定位器对照 Vue：csl-new-front/src/pages/login/components/Login.vue
 * - placeholder「请输入账号」
 * - 按钮文案「登录」
 */
const { test, expect } = require('@playwright/test');
const { ACCOUNTS } = require('../utils/accounts');

test.describe('前台登录（UI）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('itCode 登录成功并进入工作台', async ({ page }) => {
    const itCode = ACCOUNTS.frontOwner;

    await page.goto('/login');

    // 若有系统提示弹窗则关闭（对齐 Python 点 t-dialog__cancel）
    const cancel = page.locator('button.t-dialog__cancel');
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }

    const account = page.getByPlaceholder('请输入账号');
    await expect(account).toBeVisible();
    await account.fill(itCode);

    await page.getByRole('button', { name: '登录' }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/(workbench|index|project)/);
  });
});
