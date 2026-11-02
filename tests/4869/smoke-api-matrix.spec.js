// @ts-check
/**
 * TC-API-001 / SMOKE-API-001 — 审批矩阵接口结构与鉴权
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { superAdmin } = require('../../utils/accounts');
const {
  approvalMatrixApiAs,
  getMatrixAnonymous,
  assertMatrixShape,
  MATRIX_ROW_KEYS,
} = require('../../utils/approval-matrix-api');

function pickProject() {
  const fx = loadFixture4869() || {};
  return fx.N07 || fx.D04 || fx.D01 || null;
}

test.describe('4869 矩阵 API', () => {
  test('TC-API-001 登录态 GET approvalMatrix 四行结构正确', async ({ request }) => {
    const row = pickProject();
    test.skip(!row?.project_id, '缺少 fixture N07/D04，先跑 npm run prepare:4869');

    const api = await approvalMatrixApiAs(request, superAdmin());
    const body = await api.getMatrix({
      projectId: row.project_id,
      location: row.location ?? 7,
      secondAudit: row.second_audit ?? 0,
    });
    const data = assertMatrixShape(body);
    expect(data.rows.map((r) => r.key)).toEqual(expect.arrayContaining(MATRIX_ROW_KEYS));
    expect(data.totalRow).toBeTruthy();
  });

  test('SMOKE-API-001 无 Token 不能拉矩阵', async ({ request }) => {
    const row = pickProject();
    test.skip(!row?.project_id, '缺少 fixture N07/D04');

    const body = await getMatrixAnonymous(request, {
      projectId: row.project_id,
      location: row.location ?? 7,
      secondAudit: row.second_audit ?? 0,
    });
    const ok = body && (body.code === 0 || body.code === 200);
    const hasRows = ok && body.data && Array.isArray(body.data.rows) && body.data.rows.length > 0;
    expect(hasRows, `未登录不应返回矩阵行 body=${JSON.stringify(body).slice(0, 200)}`).toBeFalsy();
  });
});
