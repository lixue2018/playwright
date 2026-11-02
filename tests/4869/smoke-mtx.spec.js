// @ts-check
/**
 * TC-MTX-004 / 005 / 008 — 矩阵表头、行头、格子=卡片数（渗透）
 */
const { test, expect } = require('@playwright/test');
const { loadFixture4869 } = require('../../utils/env');
const { AdminMatrixPage } = require('../../pages/admin-matrix');

function pickProject() {
  const fx = loadFixture4869() || {};
  return fx.N07 || fx.D04 || fx.D01 || null;
}

test.describe('TC-MTX 矩阵结构', () => {
  test('TC-MTX-004/005 风险列与状态行齐全', async ({ page }) => {
    test.setTimeout(120_000);
    const row = pickProject();
    test.skip(!row?.project_id, '缺少 fixture');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);

    const headers = (await matrix.readMatrixHeaders(dialog)).join('|');
    expect(headers).toMatch(/红线|不合规/);
    for (const col of ['严重', '高危', '中危', '低危', '提示', '合计']) {
      expect(headers, `缺列 ${col}`).toContain(col);
    }

    const labels = (await matrix.readMatrixRowLabels(dialog)).join('|');
    for (const lab of ['未修复', '遗留', '已接受', '已忽略']) {
      expect(labels, `缺行 ${lab}`).toContain(lab);
    }
    expect(labels).toMatch(/合计/);
    await matrix.closeDialog(dialog);
  });

  test('TC-MTX-008 格子数字等于抽屉卡片数（产品范围）', async ({ page }) => {
    test.setTimeout(120_000);
    const row = pickProject();
    test.skip(!row?.project_id, '缺少 fixture');

    const matrix = new AdminMatrixPage(page);
    const node = row.target_node || '渗透测试';
    await matrix.openNode(row.project_id, node);
    const dialog = await matrix.openAuditDialog(node);
    await matrix.assertHasMatrix(dialog);

    const table = matrix.matrixTable(dialog);
    const headers = table.locator('thead th');
    let highIdx = -1;
    const hc = await headers.count();
    for (let i = 0; i < hc; i += 1) {
      const t = ((await headers.nth(i).innerText()) || '').trim();
      if (t === '高危' || t.includes('高危')) {
        highIdx = i;
        break;
      }
    }
    expect(highIdx).toBeGreaterThan(0);

    const rows = table.locator('tbody tr');
    let cellText = '0';
    const rc = await rows.count();
    for (let r = 0; r < rc; r += 1) {
      const label = ((await rows.nth(r).locator('td').first().innerText()) || '').trim();
      if (label.includes('未修复')) {
        cellText = ((await rows.nth(r).locator('td').nth(highIdx).innerText()) || '').trim();
        await rows.nth(r).locator('td').nth(highIdx).click();
        break;
      }
    }

    const body = matrix.drawerBody(dialog);
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});

    const n = Number(String(cellText).replace(/[^\d]/g, '') || '0');
    if (n === 0) {
      await expect(body).toContainText(/暂无漏洞/);
    } else {
      const cards = matrix.vulnCards(dialog);
      await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBe(n);
    }
    await matrix.closeDialog(dialog);
  });
});
