// @ts-check
/**
 * SMOKE-NEW-001 / TC-NEW-003 — 打开节点审批；安全节点有矩阵，基本信息无矩阵
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { AdminMatrixPage } = require('../../pages/admin-matrix');

test.describe('SMOKE-NEW-001 审批弹窗矩阵可见性', () => {
  test('安全节点有漏洞汇总；基本信息无矩阵', async ({ page }) => {
    test.setTimeout(180_000);
    const fx = loadFixture4869() || {};
    const penet = fx.N07 || fx.D04 || fx.D01;
    const basic = fx.D03;
    test.skip(!penet?.project_id && !basic?.project_id, '缺少 fixture，先跑 npm run prepare:4869');

    const matrix = new AdminMatrixPage(page);

    if (penet?.project_id) {
      await matrix.openNode(penet.project_id, penet.target_node || '渗透测试');
      const dialog = await matrix.openAuditDialog(penet.target_node || '渗透测试');
      await matrix.assertHasMatrix(dialog);
      await matrix.closeDialog(dialog);
    }

    if (basic?.project_id) {
      await matrix.openNode(basic.project_id, '基本信息');
      const dialog = await matrix.openAuditDialog('基本信息');
      await matrix.assertNoMatrix(dialog);
      await matrix.closeDialog(dialog);
    } else if (penet?.project_id) {
      // 无 D03 时用渗透项目打开基本信息对照（已过审仍应无矩阵组件或无漏洞汇总）
      await matrix.openNode(penet.project_id, '基本信息');
      const dialog = await matrix.openAuditDialog('基本信息');
      await matrix.assertNoMatrix(dialog);
      await matrix.closeDialog(dialog);
    }
  });
});
