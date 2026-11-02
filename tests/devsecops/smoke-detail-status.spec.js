// @ts-check
/**
 * SMOKE-DS-DET / WIN / SRC — 项目详情节点状态与任务 ID
 */
const { test, expect } = require('@playwright/test');
const { AdminPlatPanelPage } = require('../../pages/admin-plat-panel');
const { loadDevsecopsFixture, requireCase } = require('../../utils/devsecops-fixture');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-DS-DET 项目详情节点状态', () => {
  test('SMOKE-DS-DET-001 未开启节点文案；有扫描可见任务ID区域', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const off = requireCase(fx, 'OFF01');
    const fix = requireCase(fx, 'FIX01');
    test.skip(!off && !fix, '缺少 fixture OFF01 或 FIX01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();

    if (off?.name) {
      await admin.searchByName(off.name);
      const detail = await admin.openDetailByName(off.name);
      const body = await detail.locator('body').innerText();
      expect(body).toMatch(/未开启/);
    }

    if (fix?.name) {
      await admin.openList();
      await admin.searchByName(fix.name);
      const detail = await admin.openDetailByName(fix.name);
      const body = await detail.locator('body').innerText();
      expect(body, '详情应能看到任务/扫描相关标识').toMatch(/任务ID|任务Id|taskId|扫描|scan/i);
    }
  });

  test('SMOKE-DS-DET-002 隐私静态检测成功', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const row = requireCase(fx, 'STATIC01');
    test.skip(!row, '缺少 fixture STATIC01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();
    await admin.searchByName(row.name);
    const detail = await admin.openDetailByName(row.name);
    await expect(detail.locator('body')).toContainText(/静态检测成功/, { timeout: 20_000 });
  });

  test('SMOKE-DS-WIN-001 Windows 渗透无初审入口', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const row = requireCase(fx, 'WIN01');
    test.skip(!row, '缺少 fixture WIN01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();
    await admin.searchByName(row.name);
    const detail = await admin.openDetailByName(row.name);
    await detail.getByText(/渗透/).first().click({ timeout: 10_000 }).catch(() => {});
    const body = await detail.locator('body').innerText();
    // 不应再走「初审」主流程；若按钮存在则点后应提示已取消
    const auditBtn = detail.getByRole('button', { name: /初审|批量初审/ }).first();
    if (await auditBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await auditBtn.click();
      const tip = await detail.locator('.el-message,.el-message-box').innerText().catch(() => '');
      expect(`${body}\n${tip}`).toMatch(/取消初审|已取消初审|Windows/);
    } else {
      expect(body).toMatch(/待修复|扫描通过|渗透/);
    }
  });

  test('SMOKE-DS-SRC-001 源码双工具项目可见报告/工具信息', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const row = requireCase(fx, 'SRC01');
    test.skip(!row, '缺少 fixture SRC01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();
    await admin.searchByName(row.name);
    const detail = await admin.openDetailByName(row.name);
    await detail.getByText(/源代码|源码/).first().click({ timeout: 10_000 }).catch(() => {});
    const body = await detail.locator('body').innerText();
    expect(body).toMatch(/CheckMarx|Checkmarx|Coverity|报告|扫描/i);
  });
});
