// @ts-check
/**
 * 5449 前台冒烟 — 详情回显入口（有编号时展示）
 */
const { test, expect } = require('@playwright/test');
const { loadFixture5449, frontNodePath, frontAbsPath } = require('../../utils/env');

function fx() {
  return loadFixture5449() || {};
}

test.describe('5449 smoke · 前台回显入口', () => {
  test('SMOKE-FRONT-PEN-FILTER 漏洞管理含修复项目编号筛选', async ({ page }) => {
    await page.goto(frontAbsPath('/loophole/loopholeb'), { waitUntil: 'domcontentloaded' });
    const label = page.getByText('修复项目编号', { exact: false }).first();
    await expect(label).toBeVisible({ timeout: 30_000 });
  });

  test('SMOKE-FRONT-PEN-NODE 渗透节点可打开', async ({ page }) => {
    const data = fx();
    test.skip(!data.project_id, '缺少 fixtures/5449');
    await page.goto(frontNodePath(data.project_id, '渗透测试'), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });
});
