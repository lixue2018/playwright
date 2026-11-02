// @ts-check
/**
 * 5449 后台冒烟 — 需求相关节点（架构/数据/隐私/AI/渗透/网络）可打开
 */
const { test, expect } = require('@playwright/test');
const { loadFixture5449, adminAbsPath, adminNodePath } = require('../../utils/env');

function fx() {
  return loadFixture5449() || {};
}

async function assertPageAlive(page) {
  await expect(page.locator('body')).toBeVisible();
  expect(page.url(), '不应停在登录页').not.toMatch(/\/login(\?|$)/i);
}

const NODES = [
  ['SMOKE-ECHO-ARCH', '架构审核'],
  ['SMOKE-ECHO-DATA', '数据安全'],
  ['SMOKE-ECHO-PRIV', '隐私安全'],
  ['SMOKE-ECHO-AI', 'AI安全'],
  ['SMOKE-ECHO-PEN', '渗透测试'],
  ['SMOKE-ECHO-NET', '网络基础设施审核'],
];

test.describe('5449 smoke · 后台需求节点入口', () => {
  for (const [id, node] of NODES) {
    test(`${id} ${node}节点页可打开`, async ({ page }) => {
      const data = fx();
      test.skip(!data.project_id, '缺少 fixtures/5449，先 npm run prepare:5449 -- --fresh --phase all');
      await page.goto(adminNodePath(data.project_id, node), { waitUntil: 'domcontentloaded' });
      await assertPageAlive(page);
    });
  }

  test('SMOKE-ECHO-PEN-LIST 渗透漏洞管理入口可达', async ({ page }) => {
    const candidates = [
      '/admin/securityAudit/loophole/loopholeb',
      '/admin/loophole/loopholeb',
      '/admin/securityAudit/loopholebManager',
    ];
    let opened = false;
    for (const path of candidates) {
      await page.goto(adminAbsPath(path), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      if (!/\/login(\?|$)/i.test(page.url())) {
        opened = true;
        break;
      }
    }
    expect(opened, '未能打开渗透漏洞管理').toBeTruthy();
    await assertPageAlive(page);
  });
});
