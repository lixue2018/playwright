// @ts-check
/**
 * SMOKE-DRW-001 — 点矩阵格打开抽屉，含本轮未修复种子
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { AdminMatrixPage } = require('../../pages/admin-matrix');

/** 漏洞状态 → 矩阵行文案 */
function matrixRowOf(status) {
  if (['待评估', '待复测', '待修复'].includes(status)) return '未修复';
  if (status === '遗留') return '遗留';
  if (status === '已接受') return '已接受';
  if (status === '已忽略') return '已忽略';
  return '未修复';
}

function pickUnfixedSeed(row) {
  const seeds = Array.isArray(row.seed_vulns) ? row.seed_vulns : [];
  const unfixed = ['待评估', '待复测', '待修复'];
  return (
    seeds.find((s) => s.level === '高危' && unfixed.includes(s.status || '')) ||
    seeds.find((s) => unfixed.includes(s.status || '')) ||
    null
  );
}

test.describe('SMOKE-DRW 抽屉', () => {
  test('SMOKE-DRW-001 点未修复格，抽屉含种子名', async ({ page }) => {
    test.setTimeout(120_000);
    const fx = loadFixture4869() || {};
    const row = fx.N07 || fx.D01;
    test.skip(!row?.project_id, '缺少 fixture N07');

    const seed = pickUnfixedSeed(row);
    test.skip(!seed?.name, '缺少未修复态 seed_vulns，先跑 prepare --phase vuln,status');

    const matrix = new AdminMatrixPage(page);
    await matrix.openNode(row.project_id, row.target_node || '渗透测试');
    const dialog = await matrix.openAuditDialog(row.target_node || '渗透测试');
    await matrix.assertHasMatrix(dialog);

    const rowLabel = matrixRowOf(seed.status);
    try {
      await matrix.clickCell(dialog, rowLabel, seed.level || '高危');
    } catch {
      await matrix.clickCell(dialog, rowLabel, '合计');
    }

    const body = matrix.drawerBody(dialog);
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    const text = await body.innerText();
    if (text.includes('暂无漏洞')) {
      await matrix.clickCell(dialog, rowLabel, '合计');
      await body.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    }
    const needle = String(seed.name).slice(0, 28);
    await matrix.assertDrawerHasText(dialog, needle);
    await matrix.closeDialog(dialog);
  });

  test('SMOKE-DRW-002 展开种子卡片可见描述和建议', async ({ page }) => {
    test.setTimeout(120_000);
    const fx = loadFixture4869() || {};
    const row = fx.N07 || fx.D01;
    test.skip(!row?.project_id, '缺少 fixture N07');
    const seed = pickUnfixedSeed(row);
    test.skip(!seed?.name, '缺少未修复种子');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);
    try {
      await matrix.clickCell(dialog, matrixRowOf(seed.status), seed.level || '提示');
    } catch {
      await matrix.clickCell(dialog, '未修复', '合计');
    }
    await matrix.assertDrawerHasText(dialog, seed.name.slice(0, 20));
    await matrix.expandFirstCard(dialog);
    const body = matrix.drawerBody(dialog);
    await expect(body).toContainText(/漏洞描述|描述/, { timeout: 10_000 });
    await expect(body).toContainText(/修复建议|建议/, { timeout: 10_000 });
    await matrix.closeDialog(dialog);
  });

  test('SMOKE-DRW-004 点 0 格抽屉空态', async ({ page }) => {
    test.setTimeout(120_000);
    const fx = loadFixture4869() || {};
    // D04 全 0 最稳；N07 可点「已关闭」行若存在且为 0
    const row = fx.D04 || fx.N07 || fx.D01;
    test.skip(!row?.project_id, '缺少 fixture');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);

    const table = matrix.matrixTable(dialog);
    const headers = table.locator('thead th');
    let tipIdx = -1;
    const hc = await headers.count();
    for (let i = 0; i < hc; i += 1) {
      const t = ((await headers.nth(i).innerText()) || '').trim();
      if (t === '提示' || t.includes('提示')) {
        tipIdx = i;
        break;
      }
    }
    test.skip(tipIdx < 0, '无提示列');

    const rows = table.locator('tbody tr');
    const rc = await rows.count();
    let clicked = false;
    for (let r = 0; r < rc; r += 1) {
      const label = ((await rows.nth(r).locator('td').first().innerText()) || '').trim();
      const val = ((await rows.nth(r).locator('td').nth(tipIdx).innerText()) || '').trim();
      if ((label.includes('已关闭') || (fx.D04 && label.includes('未修复'))) && /^0$/.test(val)) {
        await rows.nth(r).locator('td').nth(tipIdx).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // 任意 0 格
      for (let r = 0; r < rc && !clicked; r += 1) {
        const cells = rows.nth(r).locator('td');
        const cc = await cells.count();
        for (let c = 1; c < cc; c += 1) {
          const val = ((await cells.nth(c).innerText()) || '').trim();
          if (/^0$/.test(val)) {
            await cells.nth(c).click();
            clicked = true;
            break;
          }
        }
      }
    }
    test.skip(!clicked, '产品范围无 0 格，本条 N/A');

    const body = matrix.drawerBody(dialog);
    await expect(body).toBeVisible({ timeout: 10_000 });
    await expect(body).toContainText(/暂无漏洞|0/, { timeout: 10_000 });
    await matrix.closeDialog(dialog);
  });
});
