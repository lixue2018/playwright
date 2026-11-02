/**
 * 后台节点审批（页面）— 对齐 AT_py stage3_approve_node.approve_project_node
 * 供 4834 prepare 页面造数使用（禁止 API 审批）。
 */
const { AdminMatrixPage } = require('../../pages/admin-matrix');

/**
 * @param {import('@playwright/test').Page} page
 * @param {string|number} projectId
 * @param {string} nodeName
 * @param {{ approvalResult?: string, remark?: string }} [opts]
 */
async function approveNodeUi(page, projectId, nodeName, opts = {}) {
  const approvalResult = opts.approvalResult || '审批通过';
  const remark = opts.remark || '4834造数';
  const matrix = new AdminMatrixPage(page);

  await matrix.openNode(projectId, nodeName);

  if (nodeName === '基本信息') {
    await ensureBizLevel(page);
  }

  const dialog = await matrix.openAuditDialog(nodeName);
  await matrix.selectApprovalResult(dialog, approvalResult);
  await fillRemark(dialog, page, remark);
  await matrix.clickSubmit(dialog);

  const tip = page.locator('.el-message, .el-notification, .t-message').first();
  await tip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  const tipText = ((await tip.innerText().catch(() => '')) || '').trim();
  if (nodeName === '基本信息' && /请选择业务等级/.test(tipText)) {
    // 弹窗仍开着：关掉 → 再选等级保存 → 重审
    await matrix.closeDialog(dialog);
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    await ensureBizLevel(page);
    const dialog2 = await matrix.openAuditDialog(nodeName);
    await matrix.selectApprovalResult(dialog2, approvalResult);
    await fillRemark(dialog2, page, remark);
    await matrix.clickSubmit(dialog2);
    const tip2 = page.locator('.el-message, .el-notification, .t-message').first();
    await tip2.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    const t2 = ((await tip2.innerText().catch(() => '')) || '').trim();
    if (/请选择业务等级/.test(t2)) {
      throw new Error(`基本信息审批仍提示选择业务等级：${t2}`);
    }
    await dialog2.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  } else {
    await dialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }

  if (nodeName === '基本信息') {
    await page.waitForTimeout(2000);
    await matrix.openNode(projectId, nodeName);
  }
  return { ok: true, approvalResult, nodeName };
}

/**
 * 对齐 AT_py stage3 `_handle_biz_level_save`：
 * 滚动到「业务等级」→ 点「绩效域」→ 点该行「保存」（不是其它设置的保存）。
 */
async function ensureBizLevel(page) {
  await page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});

  const bizForm = page
    .locator('.el-form')
    .filter({ has: page.locator('.el-form-item__label, label').filter({ hasText: /业务等级/ }) })
    .first();
  await bizForm.waitFor({ state: 'visible', timeout: 20_000 });
  await bizForm.scrollIntoViewIfNeeded();

  const radio = bizForm.locator('label.el-radio').filter({ hasText: /绩效域/ }).first();
  await radio.waitFor({ state: 'visible', timeout: 15_000 });
  await radio.scrollIntoViewIfNeeded();
  const inner = radio.locator('.el-radio__inner').first();
  if (await inner.count()) {
    await inner.click({ force: true });
  } else {
    await radio.click({ force: true });
  }
  await page.waitForTimeout(400);
  const checked = await radio.evaluate(
    (el) =>
      el.classList.contains('is-checked') ||
      !!(el.querySelector('input[type=radio]') && el.querySelector('input[type=radio]').checked),
  );
  if (!checked) {
    await radio.click({ force: true });
    await page.waitForTimeout(300);
  }

  const saveBtn = bizForm.getByRole('button', { name: /保存/ }).first();
  await saveBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await saveBtn.click();
  await page
    .locator('.el-message')
    .filter({ hasText: /保存|成功|完成/ })
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);
}

async function fillRemark(dialog, page, remark) {
  const area = dialog.locator('textarea').first();
  if (!(await area.isVisible({ timeout: 3_000 }).catch(() => false))) return;
  await area.click();
  await area.fill(remark);
}

module.exports = { approveNodeUi };
