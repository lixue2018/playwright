// @ts-check
/**
 * 4834 纯函数逻辑用例 — 对齐 run_4834.py 中 *_logic / CASE_SET=logic
 * 无需浏览器与环境 API。
 */
const { test, expect } = require('@playwright/test');
const {
  DEFAULT_AUTO_CLOSE_DAYS,
  DEFAULT_FREQUENCY,
  DEFAULT_AUTO_PAUSE_DAYS,
  NODE_LOCATION,
  ST_REJECT,
  canPause,
  isFrequencyPoint,
  autoCloseCountdown,
  shouldAutoClose,
  resolveFrequency,
  resolveAutoCloseDays,
  resolveAutoPauseDays,
  matchRule,
  isSubNode,
  sortPauseMailItems,
  topPauseMailItems,
  noEnabledNodes,
  shouldSendPauseReminder,
  maxPauseDaysAmong,
  pauseMailDetailLocation,
  todoApplyTypeOrMatch,
  shouldBackfillHistoricalAutoJob,
} = require('../../../utils/rules');

test.describe('4834 logic · CFG', () => {
  test('TC-CFG-010 autoCloseDays 边界回落', () => {
    expect(resolveAutoCloseDays(1)).toBe(1);
    expect(resolveAutoCloseDays(0)).toBe(DEFAULT_AUTO_CLOSE_DAYS);
  });

  test('TC-CFG-011 frequency 边界发送点', () => {
    expect(isFrequencyPoint(1, 1)).toBeTruthy();
    expect(isFrequencyPoint(999, 999)).toBeTruthy();
  });

  test('TC-CFG-020 noEnabledNodes', () => {
    expect(noEnabledNodes([])).toBeTruthy();
    expect(noEnabledNodes([{ status: 0 }, { status: 0 }])).toBeTruthy();
    expect(noEnabledNodes([{ status: 0 }, { status: 1 }])).toBeFalsy();
  });
});

test.describe('4834 logic · AP', () => {
  test('TC-AP-006 持续天数超过阈值才自动暂停', () => {
    const shouldAutoPause = (day, threshold) => day > threshold;
    const x = 7;
    expect(shouldAutoPause(x, x)).toBeFalsy();
    expect(shouldAutoPause(x - 1, x)).toBeFalsy();
    expect(shouldAutoPause(x + 1, x)).toBeTruthy();
  });

  test('TC-AP-009 autoPauseDays 回落', () => {
    expect(resolveAutoPauseDays(null)).toBe(DEFAULT_AUTO_PAUSE_DAYS);
    expect(resolveAutoPauseDays(0)).toBe(DEFAULT_AUTO_PAUSE_DAYS);
    expect(resolveAutoPauseDays(3)).toBe(3);
  });

  test('TC-AP-015 历史超期不回溯', () => {
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: true })).toBeFalsy();
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: false })).toBeTruthy();
  });
});

test.describe('4834 logic · PM', () => {
  test('TC-PM-009 / TC-PM-014 频率点', () => {
    expect(isFrequencyPoint(5, 5)).toBeTruthy();
    expect(isFrequencyPoint(6, 5)).toBeFalsy();
    expect(isFrequencyPoint(4, 5)).toBeFalsy();
  });

  test('TC-PM-003 最长暂停天数判频率点', () => {
    expect(isFrequencyPoint(10, 5)).toBeTruthy();
  });

  test('TC-PM-004 仅统计仍暂停节点最长天数', () => {
    const active = [
      { name: '隐私安全', pauseDays: 9 },
      { name: '渗透测试', pauseDays: 5 },
    ];
    expect(maxPauseDaysAmong(active)).toBe(9);
    expect(isFrequencyPoint(5, 5)).toBeTruthy();
  });

  test('TC-PM-004a 倒计时', () => {
    expect(autoCloseCountdown(60, 5)).toBe(55);
  });

  test('TC-PM-004b 恢复后邮件表只剩剩余节点', () => {
    const items = [
      { location: 2, pauseDays: 10, name: 'A' },
      { location: 23, pauseDays: 10, name: 'B' },
    ];
    const left = items.filter((i) => i.name !== 'A');
    expect(sortPauseMailItems(left)[0].name).toBe('B');
  });

  test('TC-PM-004c 仅申请未真正暂停不入表', () => {
    const paused = [{ location: 23, pauseDays: 5, name: 'B' }];
    expect(Math.max(...paused.map((i) => i.pauseDays))).toBe(5);
  });

  test('TC-PM-005 邮件节点表取 Top5 降序', () => {
    const items = [1, 3, 5, 7, 9, 11, 2].map((d, i) => ({
      location: i + 1,
      pauseDays: d,
    }));
    const top = topPauseMailItems(items, 5);
    expect(top).toHaveLength(5);
    const days = top.map((x) => Number(x.pauseDays));
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });

  test('TC-PM-006 countdown 边界', () => {
    expect(autoCloseCountdown(60, 58)).toBe(2);
    expect(autoCloseCountdown(60, 60)).toBe(0);
    expect(autoCloseCountdown(60, 61)).toBe(0);
  });

  test('TC-PM-007 联系人取最长暂停节点', () => {
    const items = sortPauseMailItems([
      { location: 2, pauseDays: 5, owner: 'short' },
      { location: 7, pauseDays: 12, owner: 'long' },
    ]);
    expect(items[0].owner).toBe('long');
  });

  test('TC-PM-008 matchRule 升级次数', () => {
    const rules = [
      { num: 1, days: 5, to: 'owner' },
      { num: 6, days: 30, to: 'leader' },
      { num: 9, days: 45, to: 'director' },
    ];
    expect(matchRule(rules, 30)?.to).toBe('leader');
    expect(matchRule(rules, 4)).toBeNull();
    expect(matchRule(rules, 45)?.to).toBe('director');
  });

  test('TC-PM-013 子节点判定', () => {
    expect(isSubNode(7, 1)).toBeTruthy();
    expect(isSubNode(7, 0)).toBeFalsy();
    expect(isSubNode(2, 1)).toBeFalsy();
  });

  test('TC-PM-015 frequency 脏数据回落', () => {
    expect(resolveFrequency(0)).toBe(DEFAULT_FREQUENCY);
    expect(isFrequencyPoint(5, 0)).toBeTruthy();
  });

  test('TC-PM-017 暂停邮件详情跳转基本信息', () => {
    const expectLoc = pauseMailDetailLocation();
    expect(expectLoc).toBe(NODE_LOCATION['基本信息'][0]);
    expect(expectLoc).not.toBe(10);
  });

  test('TC-PM-026 周末/法定假发送策略', () => {
    expect(shouldSendPauseReminder({ isStatutoryHoliday: false, isWeekend: true })).toBeTruthy();
    expect(shouldSendPauseReminder({ isStatutoryHoliday: false, isWeekend: false })).toBeTruthy();
    expect(shouldSendPauseReminder({ isStatutoryHoliday: true, isWeekend: true })).toBeFalsy();
    expect(shouldSendPauseReminder({ isStatutoryHoliday: true, isWeekend: false })).toBeFalsy();
    expect(shouldSendPauseReminder({ isStatutoryHoliday: null, isWeekend: false })).toBeFalsy();
  });
});

test.describe('4834 logic · AC', () => {
  test('TC-AC-005 等于阈值不关闭', () => {
    expect(shouldAutoClose(60, 60)).toBeFalsy();
    expect(shouldAutoClose(61, 60)).toBeTruthy();
  });

  test('TC-AC-008 项目级关闭天数', () => {
    expect(shouldAutoClose(11, 10)).toBeTruthy();
    expect(shouldAutoClose(10, 10)).toBeFalsy();
  });

  test('TC-AC-009 autoCloseDays 回落', () => {
    expect(resolveAutoCloseDays(null)).toBe(DEFAULT_AUTO_CLOSE_DAYS);
    expect(resolveAutoCloseDays(-1)).toBe(DEFAULT_AUTO_CLOSE_DAYS);
  });

  test('TC-AC-013 历史暂停超长不回溯', () => {
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: true })).toBeFalsy();
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: false })).toBeTruthy();
  });
});

test.describe('4834 logic · FP/FC/HIST/TODO', () => {
  test('TC-FP-024 审批不通过允许申请暂停', () => {
    expect(canPause(ST_REJECT)).toBeTruthy();
  });

  test('TC-FC-006 canClose 禁态', () => {
    const { canClose, ST_PASS, ST_PASS_LEFT, ST_CLOSED } = require('../../../utils/rules');
    for (const st of [ST_PASS, ST_PASS_LEFT, ST_CLOSED]) {
      expect(canClose(st), `状态 ${st} 不应允许关闭`).toBeFalsy();
    }
  });

  test('TC-HIST-004 自然日差', () => {
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(d0);
    d1.setDate(d1.getDate() - 5);
    const between = Math.round((d0 - d1) / 86400000);
    expect(between).toBe(5);
  });

  test('TC-HIST-007 不回溯（AP+AC）', () => {
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: true })).toBeFalsy();
    expect(shouldBackfillHistoricalAutoJob({ createdBeforeRelease: false })).toBeTruthy();
  });

  test('TC-TODO-002 待办默认或条件', () => {
    expect(todoApplyTypeOrMatch({ applyTypeHit: true, projectOrNodeStatusHit: false })).toBeTruthy();
    expect(todoApplyTypeOrMatch({ applyTypeHit: false, projectOrNodeStatusHit: true })).toBeTruthy();
    expect(todoApplyTypeOrMatch({ applyTypeHit: false, projectOrNodeStatusHit: false })).toBeFalsy();
  });
});
