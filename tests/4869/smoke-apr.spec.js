// @ts-check
/**
 * SMOKE-APR-001 / 002 — 审批提交与必填校验
 * APR-002 用 N07（不改节点态）；APR-001 用 D04 提交免审（会推进渗透节点）
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { AdminMatrixPage } = require('../../pages/admin-matrix');

test.describe('SMOKE-APR 审批提交', () => {
  test('SMOKE-APR-002 不选审批结果不能提交', async ({ page }) => {
    test.setTimeout(120_000);
    const fx = loadFixture4869() || {};
    const row = fx.N07 || fx.D04 || fx.D01;
    test.skip(!row?.project_id, '缺少 fixture');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);
    await matrix.clickSubmit(dialog);

    await expect
      .poll(
        async () => {
          const msgs = await matrix.visibleMessages();
          const bodyText = await dialog.innerText().catch(() => '');
          const pageText = await page.locator('body').innerText().catch(() => '');
          const blob = `${msgs}\n${bodyText}\n${pageText}`;
          return /不能为空|必填|required/i.test(blob) || /审批结果/.test(msgs);
        },
        { timeout: 8_000 },
      )
      .toBeTruthy();
    await matrix.assertDialogOpen(dialog);
    await matrix.closeDialog(dialog);
  });

  test('SMOKE-APR-001 选结果后可提交审批', async ({ page }) => {
    test.setTimeout(120_000);
    const fx = loadFixture4869() || {};
    // 用 D04：无漏洞矩阵，提交后不伤 N07 主路径
    const row = fx.D04;
    test.skip(!row?.project_id, '缺少 fixture D04，先 prepare --only D04');
    if (process.env.SKIP_SUBMIT === '1') test.skip(true, 'SKIP_SUBMIT=1');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);

    // 免审优先；没有则审批通过
    try {
      await matrix.selectApprovalResult(dialog, '免审');
    } catch {
      await matrix.selectApprovalResult(dialog, '审批通过');
    }
    await matrix.clickSubmit(dialog);

    await expect
      .poll(async () => {
        const open = await dialog.isVisible().catch(() => false);
        const msgs = await matrix.visibleMessages();
        return !open || /成功|通过|提交/.test(msgs);
      }, { timeout: 20_000 })
      .toBeTruthy();
  });
});
