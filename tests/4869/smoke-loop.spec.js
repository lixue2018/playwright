// @ts-check
/**
 * SMOKE-LOOP-001 / 002 — 抽屉↔详情 / 改已忽略回流矩阵（渗透节点 N07）
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { superAdmin } = require('../../utils/accounts');
const { AdminMatrixPage } = require('../../pages/admin-matrix');
const {
  approvalMatrixApiAs,
  assertMatrixShape,
  cellCount,
} = require('../../utils/approval-matrix-api');
const { loopholebApiAs } = require('../../utils/loopholeb-api');

function pickN07() {
  const fx = loadFixture4869() || {};
  return fx.N07 || fx.D01 || null;
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

test.describe('SMOKE-LOOP 闭环', () => {
  test('SMOKE-LOOP-001 抽屉字段与详情一致且弹窗不关', async ({ page }) => {
    test.setTimeout(150_000);
    if (process.env.SKIP_LOOP === '1') test.skip(true, 'SKIP_LOOP=1');
    const row = pickN07();
    test.skip(!row?.project_id, '缺少 fixture N07');
    const seed = pickUnfixedSeed(row);
    test.skip(!seed?.name, '缺少未修复种子');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);

    const rowLabel = ['待评估', '待复测', '待修复'].includes(seed.status) ? '未修复' : seed.status;
    try {
      await matrix.clickCell(dialog, rowLabel, seed.level || '提示');
    } catch {
      await matrix.clickCell(dialog, '未修复', '合计');
    }
    await matrix.assertDrawerHasText(dialog, seed.name.slice(0, 24));

    const body = matrix.drawerBody(dialog);
    const cardText = await body.innerText();
    expect(cardText).toContain(seed.name.slice(0, 20));

    const beforePages = page.context().pages().length;
    await matrix.clickVulnName(dialog, seed.name.slice(0, 20));

    await expect
      .poll(() => page.context().pages().length, { timeout: 12_000 })
      .toBeGreaterThan(beforePages);

    const pages = page.context().pages();
    const detail = pages[pages.length - 1];
    await detail.waitForLoadState('domcontentloaded').catch(() => {});
    const detailText = await detail.locator('body').innerText();
    expect(
      detailText.includes(seed.name.slice(0, 16)) || /loophole|detail|Detail/i.test(detail.url()),
      '详情页应含种子或详情 URL',
    ).toBeTruthy();
    await detail.close();

    await matrix.assertDialogOpen(dialog);
    await matrix.closeDialog(dialog);

    // 节点列表搜名称
    await matrix.openNode(row.project_id, node);
    const search = page.locator('input[placeholder*="搜索"], input[placeholder*="名称"], .el-input__inner').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(seed.name.slice(0, 40));
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('body')).toContainText(seed.name.slice(0, 20), { timeout: 15_000 });
  });

  test('SMOKE-LOOP-002 改已忽略后矩阵未修复-1 / 已忽略+1', async ({ request }) => {
    test.setTimeout(120_000);
    if (process.env.SKIP_LOOP === '1') test.skip(true, 'SKIP_LOOP=1');
    const row = pickN07();
    test.skip(!row?.project_id, '缺少 fixture N07');

    const admin = superAdmin();
    const vulnApi = await loopholebApiAs(request, admin);
    const matrixApi = await approvalMatrixApiAs(request, admin);
    const loc = row.location ?? 7;
    const sa = row.second_audit ?? 0;

    // 专用闭环种子：高危待评估
    const created = await vulnApi.createVulnsOnProject(row.project_id, [
      { level: '高危', status: '待评估', name: `4869-LOOP-ignore-高危-${Date.now()}` },
    ]);
    const seed = created.created[0];
    test.skip(!seed?.vuln_id, '造闭环种子失败');
    await vulnApi.setStatus(seed.vuln_id, '待评估').catch(() => {});

    const beforeBody = await matrixApi.getMatrix({
      projectId: row.project_id,
      location: loc,
      secondAudit: sa,
    });
    const before = assertMatrixShape(beforeBody);
    const u0 = cellCount(before, 'unfixed', '高危') || 0;
    const i0 = cellCount(before, 'ignored', '高危') || 0;

    const setRes = await vulnApi.setStatus(seed.vuln_id, '已忽略');
    expect(setRes.ok, setRes.err || '改已忽略失败').toBeTruthy();

    const afterBody = await matrixApi.getMatrix({
      projectId: row.project_id,
      location: loc,
      secondAudit: sa,
    });
    const after = assertMatrixShape(afterBody);
    const u1 = cellCount(after, 'unfixed', '高危') || 0;
    const i1 = cellCount(after, 'ignored', '高危') || 0;

    expect(u1, `未修复高危 ${u0}→${u1}`).toBeLessThanOrEqual(u0);
    expect(u0 - u1, '未修复应至少 -1').toBeGreaterThanOrEqual(1);
    expect(i1 - i0, '已忽略应至少 +1').toBeGreaterThanOrEqual(1);

    const items = await matrixApi.getItems({
      projectId: row.project_id,
      location: loc,
      secondAudit: sa,
      matrixStatus: 'unfixed',
      risk: '3',
    });
    const list = Array.isArray(items.data) ? items.data : [];
    expect(list.some((it) => String(it.name || '') === seed.name)).toBeFalsy();
  });
});
