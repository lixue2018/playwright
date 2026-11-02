/**
 * 后台节点审核 + 邮件发送记录 — 翻译自 AT_py ui/admin_ops.py
 */
const { expect } = require('@playwright/test');
const { adminNodePath, sendRecordPath } = require('../utils/env');

const BTN_PAUSE_AUDIT = '暂停审核';
const BTN_RESUME_AUDIT = '恢复测试审核';
const BTN_CLOSE_AUDIT = '项目关闭审核';

class AdminOpsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  auditButton(text) {
    return this.page.getByRole('button', { name: text }).or(this.page.locator('button', { hasText: text }));
  }

  async openNode(projectId, nodeName) {
    await this.page.goto(adminNodePath(projectId, nodeName), { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveURL(/projectLocation/, { timeout: 20_000 });
    await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }

  async buttonState(text, { timeout = 8_000 } = {}) {
    const btn = this.auditButton(text);
    try {
      await btn.first().waitFor({ state: 'visible', timeout });
    } catch {
      return 'absent';
    }
    const el = btn.first();
    const disabled =
      (await el.isDisabled().catch(() => false)) || ((await el.getAttribute('class')) || '').includes('is-disabled');
    return disabled ? 'disabled' : 'enabled';
  }

  async assertAuditButton(text, { expectVisible = true } = {}) {
    const state = await this.buttonState(text, { timeout: 8_000 });
    if (expectVisible && state === 'absent') {
      throw new Error(`后台未见「${text}」按钮`);
    }
    if (!expectVisible && state === 'enabled') {
      throw new Error(`后台不应可点「${text}」但仍可见可点`);
    }
    return state;
  }

  async auditPass(auditBtnText) {
    const btn = this.page.locator('button').filter({ hasText: auditBtnText }).first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    // 弹窗标题常为「…申请审核」，不一定等于按钮文案「…审核」
    const dialog = this.page
      .locator('.el-dialog')
      .filter({ hasText: /通过|驳回|审核结果/ })
      .last();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const pass = dialog.getByRole('radio', { name: '通过' }).or(dialog.locator('.el-radio').filter({ hasText: '通过' }));
    if (await pass.first().isVisible().catch(() => false)) {
      await pass.first().click();
    }
    await dialog.getByRole('button', { name: '确定' }).or(dialog.locator('.el-dialog__footer .el-button--primary')).last().click();
    await this.page.locator('.el-message, .el-notification').first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  }

  async openSendRecordAndFind(titleKeyword) {
    await this.page.goto(sendRecordPath(), { waitUntil: 'domcontentloaded' });
    const nameInput = this.page
      .getByRole('textbox')
      .filter({ has: this.page.locator('xpath=ancestor::*[contains(., "邮件") or contains(., "名称")][1]') })
      .first()
      .or(this.page.locator('.el-form-item').filter({ hasText: /邮件名称|邮件名/ }).locator('input'))
      .or(this.page.locator('.search input.el-input__inner').first());
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill(titleKeyword);
    await this.page.getByRole('button', { name: '查询' }).click();
    await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }

  async assertSendRecordRow(titleKeyword, { toItcodes = [], ccItcodes = [], productHint = '' } = {}) {
    const query =
      productHint && !titleKeyword.includes(productHint.slice(0, 24))
        ? `${productHint.slice(0, 24)}${titleKeyword}`
        : titleKeyword;
    await this.openSendRecordAndFind(query);
    let rows = this.page.locator('.el-table__body tr');
    if (productHint && (await rows.count()) === 0) {
      await this.openSendRecordAndFind(titleKeyword);
      rows = this.page.locator('.el-table__body tr');
    }
    const hit = rows.filter({ hasText: titleKeyword }).first();
    await expect(hit, `发送记录未见「${titleKeyword}」`).toBeVisible({ timeout: 15_000 });
    const text = (await hit.innerText()).toLowerCase();
    for (const code of toItcodes) {
      if (code) expect(text, `To 未见 ${code}`).toContain(code.toLowerCase());
    }
    for (const code of ccItcodes) {
      if (code) expect(text, `CC 未见 ${code}`).toContain(code.toLowerCase());
    }
    return text;
  }
}

module.exports = {
  AdminOpsPage,
  BTN_PAUSE_AUDIT,
  BTN_RESUME_AUDIT,
  BTN_CLOSE_AUDIT,
};
