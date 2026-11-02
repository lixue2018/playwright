// @ts-check
/**
 * SMOKE-DS-LIST — DevSecOps 项目管理列表 / 节点状态筛选
 */
const { test, expect } = require('@playwright/test');
const { AdminPlatPanelPage } = require('../../pages/admin-plat-panel');
const { loadDevsecopsFixture, requireCase } = require('../../utils/devsecops-fixture');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-DS-LIST 项目管理列表筛选', () => {
  test('SMOKE-DS-LIST-001 列表打开且节点状态筛选可见', async ({ page }) => {
    test.setTimeout(120_000);
    const admin = new AdminPlatPanelPage(page);
    await admin.openList();
    await expect(admin.table()).toBeVisible({ timeout: 20_000 });
    await admin.openNodeStatusFilter();
    await expect(page.locator('.nsf-panel')).toContainText(/选择节点|源代码|隐私|基线|渗透/);
    await expect(page.locator('.nsf-footer')).toContainText(/确定筛选|清空|取消/);
  });

  test('SMOKE-DS-LIST-002 筛选未开启命中 OFF01', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const row = requireCase(fx, 'OFF01');
    test.skip(!row, '缺少 fixture OFF01（见 docs/devsecops/造数清单.md）');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();
    await admin.openNodeStatusFilter();
    await admin.pickNodeInFilter(/源代码|源码/);
    await admin.checkStatusInFilter(/未开启/);
    await admin.confirmFilter();
    if (row.name) await admin.searchByName(row.name);
    const text = await admin.rowTextByName(row.name);
    expect(text, '未开启项目应出现在筛选结果中').toMatch(new RegExp(row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(text).toMatch(/未开启|-/);
  });

  test('SMOKE-DS-LIST-003 筛选审核中 / 隐私静态检测成功', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const rev = requireCase(fx, 'REV01');
    const staticRow = requireCase(fx, 'STATIC01');
    test.skip(!rev && !staticRow, '缺少 fixture REV01 或 STATIC01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();

    if (rev) {
      await admin.openNodeStatusFilter();
      await admin.pickNodeInFilter(/隐私/);
      await admin.checkStatusInFilter(/审核中/);
      await admin.confirmFilter();
      if (rev.name) await admin.searchByName(rev.name);
      const text = await admin.rowTextByName(rev.name);
      expect(text).toMatch(/审核中/);
    }

    if (staticRow) {
      await admin.openList();
      await admin.openNodeStatusFilter();
      await admin.pickNodeInFilter(/隐私/);
      await admin.checkStatusInFilter(/静态检测成功/);
      await admin.confirmFilter();
      if (staticRow.name) await admin.searchByName(staticRow.name);
      const text = await admin.rowTextByName(staticRow.name);
      expect(text).toMatch(/静态检测成功/);
    }
  });

  test('SMOKE-DS-LIST-004 列表节点列展示状态与待修复数格式', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadDevsecopsFixture();
    const fix = requireCase(fx, 'FIX01') || requireCase(fx, 'CNT01');
    const off = requireCase(fx, 'OFF01');
    test.skip(!fix && !off, '缺少 fixture FIX01/CNT01 或 OFF01');

    const admin = new AdminPlatPanelPage(page);
    await admin.openList();

    if (fix?.name) {
      await admin.searchByName(fix.name);
      const text = await admin.rowTextByName(fix.name);
      expect(text, '待修复应带数量括号').toMatch(/漏洞待修复\s*\(\s*\d+\s*\)|待修复.*\(\d+\)/);
    }
    if (off?.name) {
      await admin.openList();
      await admin.searchByName(off.name);
      const text = await admin.rowTextByName(off.name);
      expect(text, '未开启/不可用数量应为 - 或未开启').toMatch(/未开启|-|—/);
    }
  });
});
