// @ts-check
/**
 * SMOKE-FP-001 — 前台页面提交申请暂停；邮件发送记录用后台页面核对（不调业务 API）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture, patchFixture } = require('../../utils/env');
const { frontOwner, superAdmin, nodePairByLocation } = require('../../utils/accounts');
const { FrontApplyPage, BTN_PAUSE } = require('../../pages/front-apply');
const { NODE_LOCATION } = require('../../utils/rules');
const { AdminOpsPage } = require('../../pages/admin-ops');
const { newAuthedPage, withUiSession } = require('../../utils/browser-auth');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-FP-001 前台申请暂停', () => {
  test('提交暂停申请成功并校验发送记录 To/CC', async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01');

    const row = fixture.EM01;
    const pid = row.project_id;
    const front = new FrontApplyPage(page);

    const { nodeName, state } = await front.findEnabledPauseNode(pid, row.pause_ok_node || '数据安全', [
      '源代码安全',
      '隐私安全',
      '数据安全',
    ]);
    test.skip(state !== 'enabled', '前台无可用「申请暂停」按钮，请页面重造数 EM01');

    const loc = (NODE_LOCATION[nodeName] || [23, 0])[0];

    await front.clickPause();
    const bodyText = await front.pauseDialog().innerText();
    if (!bodyText.includes('自动关闭')) {
      test.info().annotations.push({ type: 'note', description: '弹窗未明显看到自动关闭文案' });
    }

    const reason = '暂停原因-冒烟001';
    await front.fillRichReason(reason, { dialog: 'pause' });
    await front.clickDialogSubmit('pause');
    const tip = await front.toastText({ timeout: 10_000 });
    expect(tip, `提交后 toast 异常：${tip}`).toMatch(/成功|申请/);

    await front.openNode(pid, nodeName);
    const st2 = await front.buttonState(BTN_PAUSE);
    expect(st2, `申请成功后「申请暂停」仍可点 state=${st2}`).not.toBe('enabled');
    patchFixture('EM01', { last_pause_location: loc, pause_ok_node: nodeName });

    const [auditor, backup] = nodePairByLocation(loc);
    const keyword = '节点暂停申请通知';

    await withUiSession(
      await newAuthedPage(browser, request, { itCode: superAdmin(), side: 'admin' }),
      async (adminPage) => {
        const ops = new AdminOpsPage(adminPage);
        await ops.assertSendRecordRow(keyword, {
          toItcodes: [auditor, backup].filter(Boolean),
          ccItcodes: [frontOwner()],
          productHint: 'iCarbon',
        });
      },
    );
  });
});
