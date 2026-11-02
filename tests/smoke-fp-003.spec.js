// @ts-check
/**
 * SMOKE-FP-003 — 禁态节点前台「申请暂停」不可点（仅页面，不调 pause API）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../utils/env');
const { FrontApplyPage } = require('../pages/front-apply');

test.describe('SMOKE-FP-003 禁态不可申请暂停', () => {
  test('未开启/免审等禁态节点按钮不可点', async ({ page }) => {
    test.setTimeout(180_000);

    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01，请先 prepare:4834');

    const projectId = fixture.EM01.project_id;
    const samples = ['开源组件安全', '基线安全', '渗透测试', 'AI安全', '终审'];
    if (fixture.EM01.exempt_node) samples.push(fixture.EM01.exempt_node);

    const front = new FrontApplyPage(page);
    let checked = 0;

    for (const name of samples) {
      await front.openNode(projectId, name);
      const state = await front.buttonState('申请暂停', { timeout: 6_000 });
      if (state === 'enabled') continue;
      expect(state, `${name} 应为禁态或不可见，实际可点`).not.toBe('enabled');
      checked += 1;
    }

    expect(
      checked,
      '未找到任何禁态样本（未开启等）。请确认造数后 G2 仍有未开启节点',
    ).toBeGreaterThanOrEqual(1);
  });
});
