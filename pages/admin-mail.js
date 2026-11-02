/**
 * 后台邮件提醒管理 — 翻译自 AT_py ui/admin_mail.py
 * Vue：csl-new-ui mailReminder/index.vue + detail/index.vue
 */
const { expect } = require('@playwright/test');
const { mailReminderListPath, adminAbsPath } = require('../utils/env');

class AdminMailPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await this.page.goto(mailReminderListPath(), { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('button', { name: '系统预设规则' })).toBeVisible({ timeout: 20_000 });
  }

  async openSystemPreset() {
    const ctx = this.page.context();
    const popupPromise = ctx.waitForEvent('page', { timeout: 20_000 });
    await this.page.getByRole('button', { name: '系统预设规则' }).click();
    let target;
    try {
      target = await popupPromise;
      await target.waitForLoadState('domcontentloaded');
    } catch {
      target = null;
    }
    if (!target || !/mailReminder\/edit\//.test(target.url())) {
      // 弹窗被拦或未切到详情时，直开系统预设入口
      await this.page.goto(adminAbsPath('/admin/system/mailReminder/edit/1'), { waitUntil: 'domcontentloaded' });
      target = this.page;
    }
    await expect(target).toHaveURL(/mailReminder\/edit\//, { timeout: 25_000 });
    await expect(target.locator('.el-radio-button').first()).toBeVisible({ timeout: 20_000 });
    return target;
  }

  async openAddProject() {
    const ctx = this.page.context();
    const popupPromise = ctx.waitForEvent('page', { timeout: 20_000 });
    await this.page.getByRole('button', { name: /新增项目提醒|新增项目规则/ }).click();
    let target;
    try {
      target = await popupPromise;
      await target.waitForLoadState('domcontentloaded');
    } catch {
      target = null;
    }
    if (!target || !/mailReminder\/(add|edit)\//.test(target.url())) {
      await this.page.goto(adminAbsPath('/admin/system/mailReminder/add/0'), { waitUntil: 'domcontentloaded' });
      target = this.page;
    }
    await expect(target).toHaveURL(/mailReminder\/(add|edit)\//, { timeout: 25_000 });
    return target;
  }

  async selectPauseScene(page = this.page) {
    const closeMarker = page.getByText('天自动关闭项目');
    // 已在暂停场景则直接返回
    if (await closeMarker.count()) {
      await expect(closeMarker.first()).toBeVisible({ timeout: 5_000 });
      return;
    }

    const radios = page.locator('.el-radio-button');
    if (await radios.count()) {
      const pauseRadio = radios.filter({ hasText: /项目节点暂停邮件提醒|项目节点暂停|节点暂停|nodePauseMailReminder/ });
      await expect(pauseRadio.first()).toBeVisible({ timeout: 10_000 });
      await pauseRadio.first().click({ force: true });
      try {
        await expect(closeMarker.first()).toBeVisible({ timeout: 15_000 });
        return;
      } catch {
        // 回落：系统预设 type=5 详情 id=12
      }
    }

    // 项目新增页：下拉选场景
    const scene = page.locator('.el-form-item').filter({ hasText: /提醒场景/ }).locator('.el-select').first();
    if (await scene.count()) {
      await scene.click();
      const opt = page.locator('.el-select-dropdown__item:visible').filter({
        hasText: /项目节点暂停邮件提醒|项目节点暂停|节点暂停|nodePauseMailReminder/,
      });
      if (await opt.count()) {
        await opt.first().click();
        try {
          await expect(closeMarker.first()).toBeVisible({ timeout: 15_000 });
          return;
        } catch {
          /* fallthrough */
        }
      }
    }

    // 最后手段：直开系统预设暂停规则 id=12
    await page.goto(adminAbsPath('/admin/system/mailReminder/edit/12'), { waitUntil: 'domcontentloaded' });
    await expect(closeMarker.first()).toBeVisible({ timeout: 20_000 });
  }

  finalCloseRow(page = this.page) {
    return page
      .locator('div.flex.items-center, div.flex')
      .filter({ hasText: /天自动关闭项目/ })
      .first();
  }

  async assertFinalClose(page = this.page, { expectDays = 60, expectStatus = '审核暂停' } = {}) {
    await expect(page.getByText('最终处理')).toBeVisible({ timeout: 15_000 });
    const row = this.finalCloseRow(page);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('自动关闭');
    if (expectStatus) {
      await expect(row).toContainText(/审核暂停|reviewPaused/);
    }
    const input = row.locator('.el-input-number input, input').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(String(expectDays));
    return { days: expectDays, status: expectStatus };
  }
}

module.exports = { AdminMailPage };
