// @ts-check
/**
 * 5449 逻辑用例 — 对齐 docs/5449/测试用例_修复项目编号.md
 * 无需浏览器与环境；覆盖 F-002 / F-005 / 不清空 / 日志后缀判定
 */
const { test, expect } = require('@playwright/test');
const {
  LOOPHOLE_STATUS,
  CHANGED_TO_LEGACY_SUFFIX,
  allowByLegacyFixed,
  allowByAuditPass,
  valueToPersist,
  valueToPersistForAudit,
  applyPersist,
  isChangedToLegacyLog,
  computeEverRemained,
  F002_MATRIX,
  F005_MATRIX,
} = require('../../../utils/repair-project-rules');

test.describe('5449 logic · F-002 五类遗留矩阵', () => {
  for (const row of F002_MATRIX) {
    test(`${row.id} saved=${row.saved} ever=${row.everRemained} submit=${row.submit} → editable=${row.editable}`, () => {
      expect(allowByLegacyFixed(row.saved, row.submit, row.everRemained)).toBe(row.editable);
    });
  }

  test('TC-COM / F002 遗留→已修复可 persist', () => {
    expect(valueToPersist(2, 3, false, 'PSRB-1001')).toBe('PSRB-1001');
  });

  test('TC-*-F002-03 从未遗留直接已修复不写入', () => {
    expect(valueToPersist(1, 3, false, 'PSRB-1001')).toBeNull();
  });

  test('TC-*-F002-02 曾遗留+已修复可写入', () => {
    expect(valueToPersist(1, 3, true, 'PSRB-1001')).toBe('PSRB-1001');
  });

  test('TC-COM-002 / F002 空编号返回 null（选填）', () => {
    expect(valueToPersist(2, 3, false, '')).toBeNull();
    expect(valueToPersist(2, 3, false, '   ')).toBeNull();
    expect(valueToPersist(2, 3, false, null)).toBeNull();
  });

  test('TC-COM-004 不清空：禁用态 persist null 保留旧值', () => {
    const old = 'PSRB-OLD';
    expect(applyPersist(old, valueToPersist(2, 1, true, 'PSRB-NEW'))).toBe(old);
    expect(applyPersist(old, valueToPersist(1, 3, false, 'PSRB-NEW'))).toBe(old);
  });

  test('TC-*-F002-07 可编辑时空提交不擦旧值', () => {
    const old = 'PSRB-OLD';
    expect(applyPersist(old, valueToPersist(2, 3, false, ''))).toBe(old);
  });

  test('TC-*-F002-06 改绑覆盖', () => {
    expect(applyPersist('PSRB-OLD', valueToPersist(2, 3, false, 'PSRB-NEW'))).toBe('PSRB-NEW');
  });

  test('状态码常量与文档一致', () => {
    expect(LOOPHOLE_STATUS['遗留']).toBe(2);
    expect(LOOPHOLE_STATUS['已修复']).toBe(3);
  });
});

test.describe('5449 logic · 曾遗留日志后缀', () => {
  test('TC-*-F002-02b 仅后缀 " -> 遗留" 算曾遗留', () => {
    expect(isChangedToLegacyLog(`状态 待修复${CHANGED_TO_LEGACY_SUFFIX}`)).toBeTruthy();
    expect(isChangedToLegacyLog('状态 待修复 -> 遗留评估')).toBeFalsy();
    expect(isChangedToLegacyLog('留言里写了遗留两个字')).toBeFalsy();
    expect(isChangedToLegacyLog('')).toBeFalsy();
  });

  test('computeEverRemained 任一日志命中即可', () => {
    expect(computeEverRemained(['a', `x${CHANGED_TO_LEGACY_SUFFIX}`, 'b'])).toBeTruthy();
    expect(computeEverRemained(['遗留评估', '说明含遗留'])).toBeFalsy();
  });
});

test.describe('5449 logic · F-005 网络审核', () => {
  for (const row of F005_MATRIX) {
    test(`${row.id} review=${row.review} → editable=${row.editable}`, () => {
      expect(allowByAuditPass(row.review)).toBe(row.editable);
    });
  }

  test('TC-NET-002 通过+编号可写入', () => {
    expect(valueToPersistForAudit(2, 'PSRB-2001')).toBe('PSRB-2001');
  });

  test('TC-NET-003 不通过不写入、保留旧值', () => {
    expect(valueToPersistForAudit(3, 'PSRB-2001')).toBeNull();
    expect(applyPersist('PSRB-OLD', valueToPersistForAudit(3, 'PSRB-NEW'))).toBe('PSRB-OLD');
  });

  test('TC-NET-BAT-002 通过但留空保留旧值', () => {
    expect(applyPersist('PSRB-OLD', valueToPersistForAudit(2, ''))).toBe('PSRB-OLD');
  });

  test('字符串 "2" 与数字 2 等价', () => {
    expect(allowByAuditPass('2')).toBeTruthy();
    expect(allowByAuditPass(2)).toBeTruthy();
  });
});

test.describe('5449 logic · F-006 批量语义（纯函数）', () => {
  test('所选统一编号、未选保持', () => {
    const selected = [
      { id: 1, repairProject: 'PSRB-A' },
      { id: 2, repairProject: null },
    ];
    const unselected = [{ id: 3, repairProject: 'PSRB-KEEP' }];
    const next = 'PSRB-BATCH';
    const updated = selected.map((r) => ({
      ...r,
      repairProject: applyPersist(r.repairProject, valueToPersistForAudit(2, next)),
    }));
    expect(updated.every((r) => r.repairProject === next)).toBeTruthy();
    expect(unselected[0].repairProject).toBe('PSRB-KEEP');
  });
});
