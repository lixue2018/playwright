/**
 * 后台审批弹窗 + 漏洞矩阵 — 4869
 */
const { expect } = require('@playwright/test');
const { adminNodePath } = require('../utils/env');

/** 节点审批按钮文案（对齐 stage3 NODE_CONFIG.btn） */
const NODE_AUDIT_BTN = {
  基本信息: '基本信息节点审批',
  架构审核: '架构审核节点审批',
  数据安全: '数据安全节点审批',
  隐私安全: '隐私技术节点审批',
  源代码安全: '源代码安全节点审批',
  开源组件安全: '开源组件安全节点审批',
  基线安全: '基线安全节点审批',
  渗透测试: '渗透测试节点审批',
  AI安全: 'AI安全节点审批',
  网络基础设施审核: '网络基础设施节点审批',
  终审: '终审节点审批',
};

class AdminMatrixPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async openNode(projectId, nodeName) {
    await this.page.goto(adminNodePath(projectId, nodeName), { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveURL(/projectLocation/, { timeout: 20_000 });
    await this.page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }

  auditButton(nodeName) {
    const text = NODE_AUDIT_BTN[nodeName] || `${nodeName}节点审批`;
    return this.page.getByRole('button', { name: text }).or(this.page.locator('button', { hasText: text }));
  }

  async openAuditDialog(nodeName) {
    const btn = this.auditButton(nodeName).first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    const dialog = this.page.locator('.el-dialog:visible, .el-overlay-dialog:visible .el-dialog').last();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    return dialog;
  }

  matrixRoot(dialog) {
    const scope = dialog || this.page;
    return scope.locator('.vuln-overview, .matrix-card').first();
  }

  matrixTable(dialog) {
    return this.matrixRoot(dialog).locator('table.matrix-table');
  }

  async assertHasMatrix(dialog) {
    await expect(this.matrixRoot(dialog).getByText('漏洞汇总')).toBeVisible({ timeout: 15_000 });
    await expect(this.matrixTable(dialog)).toBeVisible({ timeout: 15_000 });
  }

  async assertNoMatrix(dialog) {
    const overview = this.matrixRoot(dialog);
    const visible = await overview.isVisible().catch(() => false);
    if (visible) {
      throw new Error('基本信息审批弹窗不应出现漏洞汇总矩阵');
    }
    const title = dialog.getByText('漏洞汇总');
    await expect(title).toHaveCount(0);
  }

  /** 点矩阵格：rowLabel=未修复/遗留/… colLabel=高危/中危/… 或「合计」 */
  async clickCell(dialog, rowLabel, colLabel) {
    const table = this.matrixTable(dialog);
    await expect(table).toBeVisible({ timeout: 15_000 });
    const headers = table.locator('thead th');
    const headerCount = await headers.count();
    let colIdx = -1;
    for (let i = 0; i < headerCount; i += 1) {
      const t = ((await headers.nth(i).innerText()) || '').trim();
      if (t === colLabel || t.includes(colLabel)) {
        colIdx = i;
        break;
      }
    }
    if (colIdx < 0) throw new Error(`矩阵无列「${colLabel}」`);
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    for (let r = 0; r < rowCount; r += 1) {
      const row = rows.nth(r);
      const statusCell = row.locator('td').first();
      const label = ((await statusCell.innerText()) || '').trim();
      if (label === rowLabel || label.includes(rowLabel)) {
        await row.locator('td').nth(colIdx).click();
        return;
      }
    }
    throw new Error(`矩阵无行「${rowLabel}」`);
  }

  drawer(dialog) {
    return this.drawerBody(dialog);
  }

  drawerBody(dialog) {
    const scope = dialog || this.page;
    return scope.locator('.drawer-body').last();
  }

  async assertDrawerHasText(dialog, text) {
    const body = this.drawerBody(dialog);
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    await expect(body).toContainText(text, { timeout: 15_000 });
  }

  vulnCards(dialog) {
    return this.drawerBody(dialog).locator('.vuln-card, .drawer-card, [class*="vuln-card"]');
  }

  async expandFirstCard(dialog) {
    const card = this.vulnCards(dialog).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    // 点卡片空白展开，避开蓝色名称链接
    await card.click({ position: { x: 24, y: 40 } });
  }

  async clickVulnName(dialog, nameHint) {
    const body = this.drawerBody(dialog);
    const link = nameHint
      ? body.locator('.vuln-name, a').filter({ hasText: nameHint }).first()
      : body.locator('.vuln-name, a').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
  }

  async readMatrixHeaders(dialog) {
    const headers = this.matrixTable(dialog).locator('thead th');
    const n = await headers.count();
    const texts = [];
    for (let i = 0; i < n; i += 1) {
      texts.push(((await headers.nth(i).innerText()) || '').trim());
    }
    return texts;
  }

  async readMatrixRowLabels(dialog) {
    const rows = this.matrixTable(dialog).locator('tbody tr');
    const n = await rows.count();
    const labels = [];
    for (let i = 0; i < n; i += 1) {
      labels.push(((await rows.nth(i).locator('td').first().innerText()) || '').trim());
    }
    return labels;
  }

  async selectApprovalResult(dialog, label) {
    const select = dialog.locator('.el-select').filter({ hasText: /请选择|审批|状态|结果/ }).first()
      .or(dialog.locator('.el-form-item').filter({ hasText: /审批结果/ }).locator('.el-select').first());
    await expect(select).toBeVisible({ timeout: 10_000 });
    await select.click();
    const opt = this.page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: label })
      .first();
    await expect(opt).toBeVisible({ timeout: 8_000 });
    await opt.click();
  }

  async clickSubmit(dialog) {
    const btn = dialog
      .locator('.el-dialog__footer')
      .getByRole('button', { name: /提交/ })
      .first()
      .or(dialog.getByRole('button', { name: /^提交$/ }).first());
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
  }

  async visibleMessages() {
    const msgs = this.page.locator(
      '.el-message, .el-form-item__error, .el-message-box__message, .el-form-item.is-error',
    );
    const n = await msgs.count();
    const texts = [];
    for (let i = 0; i < n; i += 1) {
      const t = ((await msgs.nth(i).innerText()) || '').trim();
      if (t) texts.push(t);
    }
    return texts.join(' ');
  }

  async assertDialogOpen(dialog) {
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  }

  async closeDialog(dialog) {
    const close = dialog.locator('.el-dialog__headerbtn, button').filter({ hasText: /关闭|取 消|取消/ }).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }
}

module.exports = { AdminMatrixPage, NODE_AUDIT_BTN };
