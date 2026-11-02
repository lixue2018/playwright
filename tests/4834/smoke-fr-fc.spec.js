// @ts-check
/**
 * SMOKE-FR-001 / FC-001 — 前台页面申请恢复、申请关闭（仅 UI，不调 nodeApply API）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture, patchFixture } = require('../../utils/env');
const { FrontApplyPage, BTN_PAUSE, BTN_RESUME, BTN_CLOSE } = require('../../pages/front-apply');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-FR / FC 恢复与关闭申请', () => {
  test('SMOKE-FR-001 暂停节点仅可申请恢复测试', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM02?.project_id, '缺少 fixture EM02');

    const row = fixture.EM02;
    const pid = row.project_id;
    const node = row.paused_node || '架构审核';

    const front = new FrontApplyPage(page);
    await front.openNode(pid, node);
    expect(await front.buttonState(BTN_PAUSE)).not.toBe('enabled');

    const resumeSt = await front.buttonState(BTN_RESUME);
    if (resumeSt !== 'enabled') {
      test.skip(
        true,
        `EM02「${node}」无可用「申请恢复测试」（state=${resumeSt}）。请页面 shape 为 paused，或先跑完 BP`,
      );
    }

    await front.clickResume();
    await front.confirmResume();
    const tip = await front.toastText({ timeout: 8_000 });
    expect(tip, `恢复申请 toast=${tip}`).toMatch(/成功|申请/);

    await front.openNode(pid, node);
    expect(await front.buttonState(BTN_RESUME)).not.toBe('enabled');
    patchFixture('EM02', { paused_node: node });
  });

  test('SMOKE-FC-001 终审申请关闭', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM02?.project_id, '缺少 fixture EM02');

    const pid = fixture.EM02.project_id;
    const front = new FrontApplyPage(page);
    await front.openNode(pid, '终审');

    const closeSt = await front.buttonState(BTN_CLOSE);
    test.skip(closeSt !== 'enabled', `终审不可申请关闭（state=${closeSt}），G2 可能未过或已关闭`);

    await front.clickClose();
    const dlg = await front.closeDialog().innerText();
    if (!dlg.includes('关闭为高影响操作')) {
      test.info().annotations.push({ type: 'note', description: '未看到高影响警示全文' });
    }
    await front.fillRichReason('关闭冒烟', { dialog: 'close' });
    await front.clickDialogSubmit('close');
    const tip = await front.toastText({ timeout: 10_000 });
    expect(tip, `申请关闭 toast=${tip}`).toMatch(/成功|申请/);
    patchFixture('EM02', { last_close_apply_id: 'ui' });
  });
});
