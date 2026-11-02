/**
 * 前台节点申请页对象 — 翻译自 AT_py ui/front_apply.py
 * Vue：NodeApplyActions.vue
 */
const { expect } = require('@playwright/test');
const { frontNodePath } = require('../utils/env');

const BTN_PAUSE = '申请暂停';
const BTN_RESUME = '申请恢复测试';
const BTN_CLOSE = '申请关闭';
const BTN_SUBMIT = '提交申请';

class FrontApplyPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  actionButton(text) {
    return this.page
      .getByRole('button', { name: text })
      .or(this.page.locator('.node-apply-actions button', { hasText: text }));
  }

  pauseButton() {
    return this.actionButton(BTN_PAUSE);
  }

  resumeButton() {
    return this.actionButton(BTN_RESUME);
  }

  closeButton() {
    return this.actionButton(BTN_CLOSE);
  }

  pauseDialog() {
    return this.page.locator('.pause-apply-dialog');
  }

  resumeDialog() {
    return this.page.locator('.t-dialog').filter({ hasText: /是否申请恢复节点测试工作|申请恢复测试/ }).last();
  }

  closeDialog() {
    return this.page.locator('.t-dialog').filter({ hasText: '申请关闭' }).filter({ hasText: '申请理由' });
  }

  toast() {
    return this.page.locator('.t-message, .t-message__content, .t-notification__content, .t-notification').first();
  }

  async dismissSystemDialog() {
    const cancel = this.page.locator('button.t-dialog__cancel');
    try {
      await cancel.waitFor({ state: 'visible', timeout: 2500 });
      await cancel.click();
    } catch {
      // no-op
    }
  }

  async openNode(projectId, nodeName) {
    await this.page.goto(frontNodePath(projectId, nodeName), { waitUntil: 'domcontentloaded' });
    await this.dismissSystemDialog();
  }

  async buttonState(text = BTN_PAUSE, opts = {}) {
    const timeout = opts.timeout ?? 8_000;
    const btn = this.actionButton(text);
    try {
      await btn.first().waitFor({ state: 'visible', timeout });
    } catch {
      return 'absent';
    }
    const el = btn.first();
    const disabled =
      (await el.isDisabled().catch(() => false)) ||
      (await el.getAttribute('disabled')) != null ||
      ((await el.getAttribute('aria-disabled')) || '').toLowerCase() === 'true' ||
      ((await el.getAttribute('class')) || '').includes('t-is-disabled');
    return disabled ? 'disabled' : 'enabled';
  }

  async assertPauseNotClickable(nodeLabel) {
    const state = await this.buttonState(BTN_PAUSE, { timeout: 6_000 });
    if (state === 'enabled') {
      throw new Error(`${nodeLabel}：禁态仍可点「${BTN_PAUSE}」（state=${state}）`);
    }
    return state;
  }

  async clickPause() {
    const btn = this.pauseButton().first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(this.pauseDialog()).toBeVisible({ timeout: 20_000 });
  }

  async clickResume() {
    const btn = this.resumeButton().first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(this.resumeDialog()).toBeVisible({ timeout: 15_000 });
  }

  async clickClose() {
    const btn = this.closeButton().first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(this.closeDialog()).toBeVisible({ timeout: 20_000 });
  }

  /**
   * TinyMCE：必须等弹窗内编辑器 initialized 再 setContent，并触发 change 才能进 Vue v-model。
   */
  async fillRichReason(text, { dialog = 'pause' } = {}) {
    const root = dialog === 'close' ? this.closeDialog() : this.pauseDialog();
    await expect(root).toBeVisible();
    await root.locator('iframe.tox-edit-area__iframe, .tox-tinymce').first().waitFor({
      state: 'visible',
      timeout: 20_000,
    });

    const html = `<p>${text}</p>`;
    const hint = dialog === 'close' ? 'close' : 'pause-apply';
    const scopeSel = dialog === 'close' ? '.t-dialog' : '.pause-apply-dialog';

    let last = '';
    for (let i = 0; i < 20; i += 1) {
      last = await this.page.evaluate(
        ({ htmlContent, hintId, plain, scope }) => {
          const tm = window.tinymce;
          if (!tm) return '';
          const list = tm.editors ? Object.values(tm.editors) : [];
          let target = null;
          for (const ed of list) {
            if (!ed || !ed.initialized) continue;
            const id = String(ed.id || '');
            const container = ed.getContainer && ed.getContainer();
            const inDialog = !!(container && container.closest && container.closest(scope));
            if (hintId && id.includes(hintId)) {
              target = ed;
              break;
            }
            if (inDialog) {
              target = ed;
              break;
            }
          }
          if (!target) return '';
          target.setContent(htmlContent);
          try {
            target.fire('change');
            target.fire('input');
            target.dispatch('change');
            target.dispatch('input');
          } catch (e) {
            /* ignore */
          }
          const el = typeof target.getElement === 'function' ? target.getElement() : null;
          if (el) {
            el.value = htmlContent;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return (target.getContent({ format: 'text' }) || '').trim();
        },
        { htmlContent: html, hintId: hint, plain: text, scope: scopeSel },
      );
      if (String(last).includes(text)) break;
      await this.page.waitForTimeout(400);
    }

    if (!String(last).includes(text)) {
      const frame = root.frameLocator('iframe.tox-edit-area__iframe').last();
      const body = frame.locator('body');
      await expect(body).toBeVisible({ timeout: 15_000 });
      await body.click();
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.type(text, { delay: 20 });
      last = await body.innerText();
    }

    if (!String(last).includes(text)) {
      throw new Error(`申请理由未写入成功，期望含 ${text}，编辑器文本=${String(last).slice(0, 80)}`);
    }
  }

  async clickDialogSubmit(dialog = 'pause') {
    const root = dialog === 'close' ? this.closeDialog() : this.pauseDialog();
    await expect(root).toBeVisible();
    await root.locator('.t-dialog__header, .t-dialog__header-content').first().click({ force: true }).catch(() => {});
    const submit = root.locator('.t-dialog__footer').getByRole('button', { name: BTN_SUBMIT });
    await expect(submit).toBeVisible();
    // 终审页把 NodeApplyActions 放在 t-form 内；弹窗「提交申请」若落到 form 内会误触 formSubmit，
    // 弹出「请先通过前置节点…」。强制 type=button 再点，避免原生 submit。
    await submit.evaluate((el) => {
      if (el instanceof HTMLButtonElement) el.type = 'button';
    });
    await submit.click();
  }

  async confirmResume() {
    const ctx = this.page.locator('.t-dialog__ctx').filter({
      hasText: /是否申请恢复节点测试工作|申请恢复测试/,
    });
    await expect(ctx.last()).toBeVisible({ timeout: 15_000 });
    const ok = ctx.last().locator('.t-dialog__footer .t-button, button.t-dialog__confirm').last();
    await expect(ok).toBeVisible();
    await ok.click();
  }

  async toastText({ timeout = 8_000 } = {}) {
    try {
      const toast = this.toast();
      await expect(toast).toBeVisible({ timeout });
      return (await toast.innerText()).trim();
    } catch {
      return '';
    }
  }

  async dialogVisible() {
    return this.pauseDialog().isVisible().catch(() => false);
  }

  async findEnabledPauseNode(projectId, preferred, alternates = []) {
    const { pauseNodeCandidates } = require('../utils/node-order');
    const uniq = [...new Set([...pauseNodeCandidates(preferred), preferred, ...alternates].filter(Boolean))];
    let lastState = 'absent';
    let lastNode = uniq[0] || '';
    for (const name of uniq) {
      await this.openNode(projectId, name);
      const state = await this.buttonState(BTN_PAUSE, { timeout: 10_000 });
      lastState = state;
      lastNode = name;
      if (state === 'enabled') return { nodeName: name, state };
    }
    return { nodeName: lastNode, state: lastState };
  }
}

module.exports = {
  FrontApplyPage,
  BTN_PAUSE,
  BTN_RESUME,
  BTN_CLOSE,
  BTN_SUBMIT,
};
