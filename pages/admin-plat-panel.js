/**
 * 后台 DevSecOps 项目管理（platPanel）
 */
const { expect } = require('@playwright/test');
const { ADMIN_BASE_URL } = require('../utils/env');

const LIST_PATHS = [
  '/devPlat/platPanel',
  '/admin/devPlat/platPanel',
  '/#/devPlat/platPanel',
];

class AdminPlatPanelPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    const base = ADMIN_BASE_URL.replace(/\/$/, '');
    let lastErr;
    for (const p of LIST_PATHS) {
      try {
        await this.page.goto(`${base}${p}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 12_000 }).catch(() => {});
        const filter = this.nodeStatusFilterInput();
        if (await filter.isVisible({ timeout: 8_000 }).catch(() => false)) return;
        // 无筛选控件时至少要有表格
        if (await this.page.locator('.el-table').first().isVisible({ timeout: 5_000 }).catch(() => false)) return;
      } catch (e) {
        lastErr = e;
      }
    }
    // 菜单兜底
    await this.page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    const menu = this.page.getByText(/DevSecOps|项目管理|平板|plat/i).first();
    if (await menu.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await menu.click();
    }
    await expect(this.page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 });
    if (lastErr) {
      // 已落到列表即可
    }
  }

  nodeStatusFilterInput() {
    return this.page
      .getByPlaceholder(/请选择节点及状态|selectNodeAndStatus|节点及状态/i)
      .or(this.page.locator('.nsf-panel').locator('..').locator('input').first())
      .first();
  }

  async openNodeStatusFilter() {
    const input = this.nodeStatusFilterInput();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.click();
    await expect(this.page.locator('.nsf-panel').first()).toBeVisible({ timeout: 8_000 });
  }

  async pickNodeInFilter(nodeLabel) {
    const item = this.page.locator('.nsf-node-item', { hasText: nodeLabel }).first();
    await expect(item).toBeVisible({ timeout: 8_000 });
    await item.click();
  }

  async checkStatusInFilter(statusLabel) {
    const box = this.page.locator('.nsf-status-group .el-checkbox', { hasText: statusLabel }).first();
    await expect(box).toBeVisible({ timeout: 8_000 });
    const checked = await box.locator('input').isChecked().catch(() => false);
    if (!checked) await box.click();
  }

  async confirmFilter() {
    await this.page.locator('.nsf-footer').getByRole('button', { name: /确定筛选|confirmFilter/i }).click();
    await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }

  async searchByName(name) {
    const input = this.page
      .locator('.el-form')
      .getByPlaceholder(/名称|应用|项目|name/i)
      .first()
      .or(this.page.locator('input[placeholder*="名称"]').first());
    if (await input.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await input.fill(String(name));
    }
    const searchBtn = this.page.getByRole('button', { name: /搜索|查询|search/i }).first();
    if (await searchBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await input.press('Enter').catch(() => {});
    }
    await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }

  table() {
    return this.page.locator('.el-table').first();
  }

  async rowTextByName(name) {
    const row = this.table().locator('.el-table__body tr', { hasText: String(name) }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    return row.innerText();
  }

  async openDetailByName(name) {
    const row = this.table().locator('.el-table__body tr', { hasText: String(name) }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const link = row.getByRole('link').first().or(row.getByText(String(name)).first());
    await link.click();
    // 详情可能新开页
    const pages = this.page.context().pages();
    const detail = pages[pages.length - 1];
    await detail.waitForLoadState('domcontentloaded').catch(() => {});
    return detail;
  }
}

module.exports = { AdminPlatPanelPage, LIST_PATHS };
