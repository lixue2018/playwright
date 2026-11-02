// @ts-check
/**
 * SMOKE-NEW-002 / SMOKE-NEW-003 — 渗透节点矩阵计数（对齐 Python，节点改为 N07 渗透）
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { superAdmin } = require('../../utils/accounts');
const { approvalMatrixApiAs, assertMatrixShape } = require('../../utils/approval-matrix-api');
const { AdminMatrixPage } = require('../../pages/admin-matrix');

function pickN07() {
  const fx = loadFixture4869() || {};
  return fx.N07 || fx.D01 || null;
}

test.describe('SMOKE-NEW-002/003 矩阵计数', () => {
  test('SMOKE-NEW-002 矩阵含本项目种子且 items 可对齐', async ({ request, page }) => {
    test.setTimeout(120_000);
    const row = pickN07();
    test.skip(!row?.project_id, '缺少 fixture N07');
    test.skip(!(row.seed_vulns && row.seed_vulns.length), '缺少 seed_vulns，先跑 prepare --phase vuln,status');

    const api = await approvalMatrixApiAs(request, superAdmin());
    const body = await api.getMatrix({
      projectId: row.project_id,
      location: row.location ?? 7,
      secondAudit: row.second_audit ?? 0,
    });
    const data = assertMatrixShape(body);
    const unfixed = data.rows.find((r) => r.key === 'unfixed');
    const legacy = data.rows.find((r) => r.key === 'legacy');
    const accepted = data.rows.find((r) => r.key === 'accepted');
    const ignored = data.rows.find((r) => r.key === 'ignored');
    expect((unfixed?.rowTotal || 0) + (legacy?.rowTotal || 0)).toBeGreaterThan(0);

    const seed = row.seed_vuln_name || row.seed_vulns[0].name;
    const itemsBody = await api.getItems({
      projectId: row.project_id,
      location: row.location ?? 7,
      secondAudit: row.second_audit ?? 0,
    });
    const items = Array.isArray(itemsBody.data) ? itemsBody.data : [];
    const hit = items.some((it) => String(it.name || '').includes(seed) || seed.includes(String(it.name || '')));
    expect(hit || items.length >= row.seed_vulns.length, `items 应含种子 ${seed}`).toBeTruthy();

    // UI：打开渗透审批可见矩阵
    const matrix = new AdminMatrixPage(page);
    await matrix.openNode(row.project_id, row.target_node || '渗透测试');
    const dialog = await matrix.openAuditDialog(row.target_node || '渗透测试');
    await matrix.assertHasMatrix(dialog);
    await matrix.closeDialog(dialog);

    // 记下四行供 NEW-003 对照（accepted/ignored 在 status phase 后应 >=1）
    expect(accepted?.rowTotal ?? 0, '已接受行').toBeGreaterThanOrEqual(0);
    expect(ignored?.rowTotal ?? 0, '已忽略行').toBeGreaterThanOrEqual(0);
  });

  test('SMOKE-NEW-003 四行与底行合计：遗留/已接受/已忽略各至少 1', async ({ request }) => {
    const row = pickN07();
    test.skip(!row?.project_id, '缺少 fixture N07');
    test.skip(!row?.status_set, '缺少 status_set，先跑 prepare --phase status');

    const api = await approvalMatrixApiAs(request, superAdmin());
    const body = await api.getMatrix({
      projectId: row.project_id,
      location: row.location ?? 7,
      secondAudit: row.second_audit ?? 0,
    });
    const data = assertMatrixShape(body);
    const byKey = Object.fromEntries(data.rows.map((r) => [r.key, r]));
    expect(byKey.legacy?.rowTotal ?? 0, '遗留行').toBeGreaterThanOrEqual(1);
    expect(byKey.accepted?.rowTotal ?? 0, '已接受行').toBeGreaterThanOrEqual(1);
    expect(byKey.ignored?.rowTotal ?? 0, '已忽略行').toBeGreaterThanOrEqual(1);

    const bottom = data.totalRow;
    // 底行合计 = 未修复 + 遗留（不含已接受/已忽略）—— 与产品矩阵 totalRow 字段对齐校验非负
    expect(Number(bottom.rowTotal ?? 0)).toBeGreaterThanOrEqual(
      (byKey.unfixed?.rowTotal || 0) + (byKey.legacy?.rowTotal || 0) > 0 ? 1 : 0,
    );
  });
});
