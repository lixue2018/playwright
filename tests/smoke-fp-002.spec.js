// @ts-check
/**
 * SMOKE-FP-002 — 空申请理由不可提交（仅页面）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../utils/env');
const { FrontApplyPage, BTN_PAUSE } = require('../pages/front-apply');

test.describe('SMOKE-FP-002 空理由不可提交', () => {
  test('打开申请暂停弹窗，空理由点提交应被拦截', async ({ page }) => {
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01，请先 prepare:4834');

    const projectId = fixture.EM01.project_id;
    const preferred = fixture.EM01.pause_ok_node || '数据安全';
    const front = new FrontApplyPage(page);

    const { nodeName, state } = await front.findEnabledPauseNode(projectId, preferred, [
      '源代码安全',
      '隐私安全',
      '数据安全',
    ]);

    test.skip(
      state !== 'enabled',
      `${nodeName} 无可用「${BTN_PAUSE}」（state=${state}）。请重新页面造数，勿用 API 补态`,
    );

    await front.clickPause();
    await front.clickDialogSubmit();

    const tip = await front.toastText({ timeout: 10_000 });
    const dialogStillOpen = await front.dialogVisible();

    if (!/请输入申请理由|申请理由/.test(tip)) {
      expect(
        dialogStillOpen,
        `空理由应 toast 请输入申请理由，实际 toast=${JSON.stringify(tip)} 且弹窗已关`,
      ).toBeTruthy();
    } else {
      await expect(front.pauseDialog()).toBeVisible();
      expect(tip).toMatch(/申请理由/);
    }
  });
});
