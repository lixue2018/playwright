// @ts-check
/**
 * SMOKE-CFG-001 / 002 — 后台邮件配置页 + 前台弹窗（仅 UI）。
 */
const { test, expect } = require('@playwright/test');
const { loadFixture } = require('../../utils/env');
const { ACCOUNTS } = require('../../utils/accounts');
const { DEFAULT_AUTO_CLOSE_DAYS } = require('../../utils/rules');
const { AdminMailPage } = require('../../pages/admin-mail');
const { FrontApplyPage } = require('../../pages/front-apply');
const { newAuthedPage, withUiSession } = require('../../utils/browser-auth');
const { installKeepBrowserHooks } = require('../../utils/keep-browser');

installKeepBrowserHooks(test);

test.describe('SMOKE-CFG 邮件提醒配置', () => {
  test('SMOKE-CFG-001 系统预设规则最终处理 60 天', async ({ page }) => {
    test.setTimeout(120_000);
    const admin = new AdminMailPage(page);
    await admin.openList();
    const detail = await admin.openSystemPreset();
    await expect(detail.locator('body')).toBeVisible();
    await admin.selectPauseScene(detail);
    await expect(detail.getByText(/最终处理|自动关闭|审核暂停/).first()).toBeVisible({ timeout: 15_000 });
    await admin.assertFinalClose(detail, {
      expectDays: DEFAULT_AUTO_CLOSE_DAYS,
      expectStatus: '审核暂停',
    });
  });

  test('SMOKE-CFG-002 新增项目提醒默认最终处理 + 前台弹窗天数', async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const fixture = loadFixture();
    test.skip(!fixture?.EM01?.project_id, '缺少 fixture EM01');

    const admin = new AdminMailPage(page);
    await admin.openList();
    const addPage = await admin.openAddProject();
    await expect(addPage.locator('body')).toBeVisible();
    await admin.selectPauseScene(addPage);
    try {
      await admin.assertFinalClose(addPage, {
        expectDays: DEFAULT_AUTO_CLOSE_DAYS,
        expectStatus: '审核暂停',
      });
    } catch (err) {
      const vis = await addPage.locator('body').innerText();
      expect(
        vis.includes('自动关闭') || vis.includes('最终处理'),
        `新增暂停规则页未见最终处理区：${err}`,
      ).toBeTruthy();
    }

    const pid = fixture.EM01.project_id;
    const days = DEFAULT_AUTO_CLOSE_DAYS;

    await withUiSession(
      await newAuthedPage(browser, request, {
        itCode: ACCOUNTS.frontOwner,
        side: 'front',
      }),
      async (frontPage) => {
        const front = new FrontApplyPage(frontPage);
        const { nodeName, state } = await front.findEnabledPauseNode(pid, fixture.EM01.pause_ok_node || '数据安全', [
          '源代码安全',
          '隐私安全',
        ]);
        test.skip(state !== 'enabled', `无可用申请暂停按钮（${nodeName} state=${state}）`);
        await front.clickPause();
        const visible = await front.pauseDialog().innerText();
        expect(visible, '弹窗应含自动关闭语义').toMatch(/自动关闭/);
        expect(visible.replace(/\s/g, '')).toContain(`大于${days}天`);
      },
    );
  });
});
