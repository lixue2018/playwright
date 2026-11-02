// @ts-check
/**
 * SMOKE-BR-001 / SMOKE-BC-001 — 后台页面审核；依赖前序 FR/FC 留下的待审按钮。
 * 禁止 API ensure*Pending 补造。BC 默认 skip（RUN_CLOSE=1 才跑）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../../utils/env');
const { nodeNameOf, superAdmin, auditorForLocation, nodePairByLocation } = require('../../utils/accounts');
const { NODE_LOCATION } = require('../../utils/rules');
const { AdminOpsPage, BTN_RESUME_AUDIT, BTN_CLOSE_AUDIT } = require('../../pages/admin-ops');
const { FrontApplyPage, BTN_RESUME } = require('../../pages/front-apply');
const { newAuthedPage, withUiSession } = require('../../utils/browser-auth');
const { frontOwner } = require('../../utils/accounts');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

const RUN_CLOSE = !['0', 'false', 'no'].includes(String(process.env.RUN_CLOSE || '0').toLowerCase());

async function pickAdminWhoSees(browser, request, { pid, node, auditBtn, candidates }) {
  let lastErr = '';
  for (const who of [...candidates, superAdmin()].filter(Boolean)) {
    const session = await newAuthedPage(browser, request, { itCode: who, side: 'admin' });
    try {
      const ops = new AdminOpsPage(session.page);
      await ops.openNode(pid, node);
      const state = await ops.buttonState(auditBtn, { timeout: 12_000 });
      if (state === 'absent' || state === 'disabled') {
        lastErr = `${who} 未见可点「${auditBtn}」 state=${state}`;
        await session.dispose({ failed: false });
        continue;
      }
      return { session, ops, who, page: session.page };
    } catch (err) {
      lastErr = `${who}: ${err.message || err}`;
      await session.dispose({ failed: true, reason: lastErr });
      throw err;
    }
  }
  throw new Error(`本节点主审/Backup/超管均未见「${auditBtn}」：${lastErr}`);
}

test.describe('SMOKE-BR / BC 后台恢复与关闭审核', () => {
  test('SMOKE-BR-001 恢复测试审核通过后离开暂停', async ({ request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM02?.project_id, '缺少 fixture EM02');

    const pid = Number(fixture.EM02.project_id);
    const node = fixture.EM02.paused_node || '数据安全';
    const loc = Number(fixture.EM02.paused_location || (NODE_LOCATION[node] || [23])[0]);
    const [a, b] = nodePairByLocation(loc);

    let picked;
    try {
      picked = await pickAdminWhoSees(browser, request, {
        pid,
        node,
        auditBtn: BTN_RESUME_AUDIT,
        candidates: [a, b, auditorForLocation(loc)],
      });
    } catch (err) {
      test.skip(true, `${err.message || err}。请先跑 SMOKE-FR（页面申请恢复），勿 API 补造`);
      return;
    }

    const { session, ops, page } = picked;
    try {
      await expect(page.locator('button').filter({ hasText: BTN_RESUME_AUDIT })).toBeVisible({
        timeout: 20_000,
      });
      await ops.auditPass(BTN_RESUME_AUDIT);
      await ops.openNode(pid, node);
      await session.dispose({ failed: false });
    } catch (err) {
      await session.dispose({ failed: true, reason: err.message || String(err) });
      throw err;
    }

    await withUiSession(
      await newAuthedPage(browser, request, { itCode: frontOwner(), side: 'front' }),
      async (frontPage) => {
        const front = new FrontApplyPage(frontPage);
        await front.openNode(pid, node);
        const resumeSt = await front.buttonState(BTN_RESUME);
        expect(resumeSt, `恢复通过后仍应不可再点申请恢复，实际=${resumeSt}`).not.toBe('enabled');
      },
    );
  });

  test('SMOKE-BC-001 关闭申请审核通过后终审已关闭', async ({ request, browser }) => {
    test.setTimeout(180_000);
    test.skip(!RUN_CLOSE, 'RUN_CLOSE=0，跳过关闭项目（设 RUN_CLOSE=1 启用）');
    const fixture = loadFixture();
    test.skip(!fixture?.EM02?.project_id, '缺少 fixture EM02');

    const pid = Number(fixture.EM02.project_id);
    const node = '终审';
    const [a, b] = nodePairByLocation(10);

    let picked;
    try {
      picked = await pickAdminWhoSees(browser, request, {
        pid,
        node,
        auditBtn: BTN_CLOSE_AUDIT,
        candidates: [a, b, auditorForLocation(10)],
      });
    } catch (err) {
      test.skip(true, `${err.message || err}。请先跑 SMOKE-FC（页面申请关闭）`);
      return;
    }

    const { session, ops, page } = picked;
    try {
      await expect(page.locator('button').filter({ hasText: BTN_CLOSE_AUDIT })).toBeVisible({
        timeout: 20_000,
      });
      await ops.auditPass(BTN_CLOSE_AUDIT);
      await ops.openNode(pid, node);
      await session.dispose({ failed: false });
    } catch (err) {
      await session.dispose({ failed: true, reason: err.message || String(err) });
      throw err;
    }
  });
});
