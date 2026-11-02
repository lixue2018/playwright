// @ts-check
/**
 * LOGIC-DS-AGG — 对齐 TabletNodeStatusAggregator 单测
 */
const { test, expect } = require('@playwright/test');
const {
  STATUS,
  LOCATION,
  aggregateNodeStatus,
  isBusy,
  isUnfixedCountUnavailable,
} = require('../../../utils/devsecops-status');

test.describe('LOGIC-DS-AGG 节点状态聚合', () => {
  test('LOGIC-DS-AGG-001 扫描中优先于待人工审核', () => {
    expect(
      aggregateNodeStatus([STATUS.SCANNING, STATUS.PENDING_REVIEW], {
        pendingProcess: 2,
        location: LOCATION.BASELINE,
      }),
    ).toBe(STATUS.SCANNING);
  });

  test('LOGIC-DS-AGG-002 待处理+人工改状态 → 审核中', () => {
    expect(
      aggregateNodeStatus([STATUS.PENDING_REVIEW], {
        pendingProcess: 1,
        hasManualChange: true,
        location: LOCATION.PRIVACY,
      }),
    ).toBe(STATUS.UNDER_REVIEW);
  });

  test('LOGIC-DS-AGG-003 失败+通过 → 扫描通过', () => {
    expect(
      aggregateNodeStatus([STATUS.FAILED, STATUS.PASSED], {
        pendingProcess: 0,
        location: LOCATION.PRIVACY,
      }),
    ).toBe(STATUS.PASSED);
  });

  test('LOGIC-DS-AGG-004 全部失败 → 扫描失败', () => {
    expect(
      aggregateNodeStatus([STATUS.FAILED, STATUS.FAILED], {
        location: LOCATION.BASELINE,
      }),
    ).toBe(STATUS.FAILED);
  });

  test('LOGIC-DS-AGG-005 静态检测成功仅隐私', () => {
    expect(
      aggregateNodeStatus([STATUS.STATIC_OK], { location: LOCATION.PRIVACY }),
    ).toBe(STATUS.STATIC_OK);
    expect(
      aggregateNodeStatus([STATUS.STATIC_OK], { location: LOCATION.BASELINE }),
    ).toBe(STATUS.PASSED);
  });

  test('LOGIC-DS-AGG-006 空日志 → 未开启(null)', () => {
    expect(aggregateNodeStatus([])).toBeNull();
  });

  test('LOGIC-DS-AGG-007 忙状态与待修复数不可用', () => {
    expect(isBusy(STATUS.WAITING)).toBe(true);
    expect(isBusy(STATUS.SCANNING)).toBe(true);
    expect(isBusy(STATUS.PENDING_REVIEW)).toBe(true);
    expect(isBusy(STATUS.UNDER_REVIEW)).toBe(true);
    expect(isBusy(STATUS.TO_FIX)).toBe(false);
    expect(isUnfixedCountUnavailable(null)).toBe(true);
    expect(isUnfixedCountUnavailable(STATUS.FAILED)).toBe(true);
    expect(isUnfixedCountUnavailable(STATUS.TO_FIX)).toBe(false);
  });
});
