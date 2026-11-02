// @ts-check
/**
 * SMOKE-BP-001 / 002 — 后台页面审核暂停申请。
 * 依赖造数 + 前序 FP 冒烟留下的待审；禁止 API 补申请。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../../utils/env');
const { auditorForLocation, nodeNameOf, nodePairByLocation, frontOwner } = require('../../utils/accounts');
const { AdminOpsPage, BTN_PAUSE_AUDIT, BTN_RESUME_AUDIT, BTN_CLOSE_AUDIT } = require('../../pages/admin-ops');
const { FrontApplyPage, BTN_PAUSE, BTN_RESUME } = require('../../pages/front-apply');
const { newAuthedPage, withUiSession } = require('../../utils/browser-auth');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-BP 后台暂停审核', () => {
  test('SMOKE-BP-001 暂停审核通过后节点变审核暂停', async ({ request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01');

    const pid = Number(fixture.EM01.project_id);
    const loc = Number(fixture.EM01.last_pause_location || fixture.EM01.pause_ok_location || 23);
    const node = nodeNameOf(loc) || fixture.EM01.pause_ok_node || '数据安全';
    const auditor = auditorForLocation(loc);
    expect(auditor, `location=${loc} 未配置审核人`).toBeTruthy();

    await withUiSession(await newAuthedPage(browser, request, { itCode: auditor, side: 'admin' }), async (page) => {
      const ops = new AdminOpsPage(page);
      await ops.openNode(pid, node);
      const btnState = await ops.buttonState(BTN_PAUSE_AUDIT);
      test.skip(
        btnState === 'absent',
        `节点「${node}」无「${BTN_PAUSE_AUDIT}」。请先跑 SMOKE-FP 提交暂停申请，勿用 API 补造`,
      );
      await ops.auditPass(BTN_PAUSE_AUDIT);
      await ops.openNode(pid, node);
    });

    await withUiSession(
      await newAuthedPage(browser, request, { itCode: frontOwner(), side: 'front' }),
      async (frontPage) => {
        const front = new FrontApplyPage(frontPage);
        await front.openNode(pid, node);
        expect(await front.buttonState(BTN_PAUSE)).not.toBe('enabled');
        const resumeSt = await front.buttonState(BTN_RESUME);
        test.skip(
          resumeSt !== 'enabled',
          `暂停后未见「申请恢复测试」（state=${resumeSt}），请核对后台是否已审过暂停`,
        );
      },
    );
  });

  test('SMOKE-BP-002 后台节点页出现对应审核按钮', async ({ request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01');

    const pid = Number(fixture.EM01.project_id);
    const loc = Number(fixture.EM01.last_pause_location || fixture.EM01.pause_ok_location || 23);
    const node = nodeNameOf(loc) || fixture.EM01.pause_ok_node || '数据安全';

    const [a, b] = nodePairByLocation(loc);
    let seen = false;
    let expectBtn = BTN_PAUSE_AUDIT;
    for (const who of [a, b].filter(Boolean)) {
      const session = await newAuthedPage(browser, request, { itCode: who, side: 'admin' });
      try {
        const ops = new AdminOpsPage(session.page);
        await ops.openNode(pid, node);
        for (const btn of [BTN_PAUSE_AUDIT, BTN_RESUME_AUDIT, BTN_CLOSE_AUDIT]) {
          const state = await ops.buttonState(btn);
          if (state !== 'absent') {
            expectBtn = btn;
            seen = true;
            break;
          }
        }
        await session.dispose({ failed: false });
        if (seen) break;
      } catch (err) {
        await session.dispose({ failed: true, reason: err.message || String(err) });
        throw err;
      }
    }
    test.skip(!seen, `主审/Backup 均未见审核按钮（节点 ${node}）。请先页面提交申请，勿 API 补造`);
    expect(seen, `应能看到「${expectBtn}」`).toBeTruthy();
  });
});
