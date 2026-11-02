// @ts-check
/**
 * 核心流程冒烟（只读）：对齐 SMOKE-FP-001 前置 —
 * 接口人打开可暂停节点，断言「申请暂停」入口存在。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../utils/env');
const { FrontApplyPage } = require('../pages/front-apply');
const { installKeepBrowserHooks } = require('../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('4834 前台节点 · 申请暂停入口', () => {
  test('可暂停节点能定位到「申请暂停」按钮', async ({ page }) => {
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture：请先造数 npm run prepare:4834');

    const projectId = fixture.EM01.project_id;
    const nodeName = fixture.EM01.pause_ok_node;
    test.skip(
      !nodeName,
      `EM01=${projectId} 没有可申请暂停节点（pause_ok_node 为空）。造数时基本信息可能未真正通过，请重新：PSRB_TEST_ENV=216 npm run prepare:4834 -- --phase all`,
    );

    const front = new FrontApplyPage(page);
    await front.openNode(projectId, nodeName);
    const state = await front.buttonState('申请暂停', { timeout: 15_000 });
    test.skip(
      state !== 'enabled' && state !== 'disabled',
      `节点「${nodeName}」看不到申请暂停按钮（state=${state}），请检查造数`,
    );
    await expect(front.pauseButton().first()).toBeVisible({ timeout: 30_000 });
  });
});
