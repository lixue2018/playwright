// @ts-check
/**
 * SMOKE-AUTH-001 — 权限负向（仅页面；不做未登录 API 探测、不 API 补 pending）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../../utils/env');
const { noInterfaceUser, foreignAuditor, nodeNameOf } = require('../../utils/accounts');
const { locPauseOk } = require('../../utils/rules');
const { AdminOpsPage, BTN_PAUSE_AUDIT } = require('../../pages/admin-ops');
const { newAuthedPage, withUiSession } = require('../../utils/browser-auth');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

async function assertMyProjectsHasNoProject(page, projectId) {
  await page.goto('/project/my', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/project\/my/, { timeout: 20_000 });
  await page.locator('.el-loading-mask, .t-loading').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});

  const idStr = String(projectId);
  const idInput = page
    .locator('.t-form-item, .el-form-item')
    .filter({ hasText: /项目编号|Project/ })
    .locator('input')
    .first()
    .or(page.getByPlaceholder(/项目编号|Project Number|请输入/).first());
  if (await idInput.isVisible().catch(() => false)) {
    await idInput.fill(idStr);
    const searchBtn = page.getByRole('button', { name: /搜索|查询|Search/ }).first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.locator('.el-loading-mask, .t-loading').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }

  const table = page.locator('.t-table, .el-table, .project-list, [class*="table"]').first();
  const scope = (await table.count()) ? table : page.locator('main, .tdesign-starter-layout-content, #app').first();
  const hit = scope.getByText(idStr, { exact: false });
  const n = await hit.count();
  for (let i = 0; i < n; i += 1) {
    const el = hit.nth(i);
    const tag = await el.evaluate((node) => {
      const input = node.closest('input, textarea, .t-input, .el-input');
      return input ? 'input' : 'cell';
    });
    expect(tag, `无角色账号「我的项目」仍能看到项目 ${idStr}`).toBe('input');
  }
}

test.describe('SMOKE-AUTH-001 权限负向', () => {
  test('无角色前台「我的项目」不可见；异节点审核人无审核按钮', async ({ request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01');

    const pid = fixture.EM01.project_id;
    const [loc] = locPauseOk(fixture.EM01);
    const node = nodeNameOf(loc) || fixture.EM01.pause_ok_node || '数据安全';

    const noRole = noInterfaceUser();
    if (noRole) {
      await withUiSession(
        await newAuthedPage(browser, request, { itCode: noRole, side: 'front' }),
        async (p2) => {
          await assertMyProjectsHasNoProject(p2, pid);
        },
      );
    }

    const foreign = foreignAuditor(loc);
    if (foreign) {
      await withUiSession(
        await newAuthedPage(browser, request, { itCode: foreign, side: 'admin' }),
        async (adminPage) => {
          const ops = new AdminOpsPage(adminPage);
          await ops.openNode(pid, node);
          await ops.assertAuditButton(BTN_PAUSE_AUDIT, { expectVisible: false });
        },
      );
    }
  });
});
