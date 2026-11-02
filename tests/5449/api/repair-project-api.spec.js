// @ts-check
/**
 * 5449 API 用例 — 对齐 docs/5449（F-002 / F-005 / 回显 / 不清空）
 * 依赖：npm run prepare:5449 -- :216
 */
const { test, expect } = require('@playwright/test');
const { loadFixture5449 } = require('../../../utils/env');
const { superAdmin } = require('../../../utils/accounts');
const { repairProjectApiAs, LOOPHOLE_STATUS } = require('../../../utils/repair-project-api');

function fx() {
  return loadFixture5449() || {};
}

function skipNo(cond, msg) {
  test.skip(!cond, msg);
}

test.describe('5449 API · 候选项目 F-003', () => {
  test('TC-F003-01 projectList 返回 repairProject 候选', async ({ request }) => {
    const api = await repairProjectApiAs(request, superAdmin());
    const opts = await api.listRepairProjectOptions();
    expect(opts.length, '至少应有一个候选项目').toBeGreaterThan(0);
    expect(opts[0].repairProject).toBeTruthy();
  });
});

test.describe('5449 API · 渗透 F-002', () => {
  test('TC-PEN-F002-01 遗留→已修复 可保存编号并回显', async ({ request }) => {
    const data = fx();
    skipNo(data.penet?.A?.id && data.repair_project, '缺少 fixture penet.A，先 prepare:5449');
    const api = await repairProjectApiAs(request, superAdmin());
    const code = data.repair_project;
    const res = await api.setLoopholebFixedWithRepair(data.penet.A.id, code);
    expect(res.ok, res.err || 'update failed').toBeTruthy();
    const again = await api.getLoopholeb(data.penet.A.id);
    expect(again.repairProject).toBe(code);
    expect(Number(again.status)).toBe(LOOPHOLE_STATUS['已修复']);
  });

  test('TC-PEN-F002-02 曾遗留→已修复 可保存编号', async ({ request }) => {
    const data = fx();
    skipNo(data.penet?.B?.id && data.repair_project, '缺少 fixture penet.B');
    const api = await repairProjectApiAs(request, superAdmin());
    const before = await api.getLoopholeb(data.penet.B.id);
    expect(before.everRemained, '造数 B 须 everRemained=true（中危及以下曾遗留）').toBeTruthy();
    const code = data.repair_project;
    const res = await api.setLoopholebFixedWithRepair(data.penet.B.id, code);
    expect(res.ok, res.err || 'update failed').toBeTruthy();
    const again = await api.getLoopholeb(data.penet.B.id);
    expect(again.repairProject).toBe(code);
  });

  test('TC-PEN-F002-03 从未遗留直接已修复 不写入编号', async ({ request }) => {
    const data = fx();
    skipNo(data.penet?.C?.id && data.repair_project, '缺少 fixture penet.C');
    const api = await repairProjectApiAs(request, superAdmin());
    const before = await api.getLoopholeb(data.penet.C.id);
    const old = before.repairProject || null;
    const res = await api.setLoopholebFixedWithRepair(data.penet.C.id, data.repair_project);
    expect(res.ok, res.err || 'status update should succeed').toBeTruthy();
    const again = await api.getLoopholeb(data.penet.C.id);
    expect(again.repairProject || null).toBe(old);
    expect(again.repairProject).not.toBe(data.repair_project);
  });

  test('TC-COM-004 已有编号后禁用态/空提交 不清空', async ({ request }) => {
    const data = fx();
    skipNo(data.penet?.A?.id && data.repair_project, '缺少 fixture penet.A');
    const api = await repairProjectApiAs(request, superAdmin());
    await api.setLoopholebFixedWithRepair(data.penet.A.id, data.repair_project);
    const detail = await api.getLoopholeb(data.penet.A.id);
    expect(detail.repairProject).toBe(data.repair_project);
    // 保持已修复但传空编号：按代码 blank→null→不写库，应保留旧值
    const resEmpty = await api.updateLoopholeb(detail, {
      status: LOOPHOLE_STATUS['已修复'],
      repairProject: '',
    });
    expect(resEmpty.ok, resEmpty.err).toBeTruthy();
    const afterEmpty = await api.getLoopholeb(data.penet.A.id);
    expect(afterEmpty.repairProject).toBe(data.repair_project);
    // 尝试改回待修复：若业务禁止，失败后编号仍在；若允许，也不应被新编号覆盖成空逻辑外的值
    const resRevert = await api.updateLoopholeb(detail, {
      status: LOOPHOLE_STATUS['待修复'],
      repairProject: 'PSRB-SHOULD-NOT-WRITE',
    });
    const again = await api.getLoopholeb(data.penet.A.id);
    if (resRevert.ok) {
      expect(again.repairProject).toBe(data.repair_project);
    } else {
      expect(again.repairProject).toBe(data.repair_project);
    }
  });
});

test.describe('5449 API · 威胁 F-002', () => {
  test('TC-THR-F002-01 架构威胁 遗留→已修复 保存编号', async ({ request }) => {
    const data = fx();
    skipNo(data.threaten?.A?.id && data.repair_project, '缺少 fixture threaten.A');
    const api = await repairProjectApiAs(request, superAdmin());
    const detail = await api.getThreaten(data.threaten.A.id);
    const res = await api.updateThreaten(detail, {
      status: LOOPHOLE_STATUS['已修复'],
      repairProject: data.repair_project,
    });
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getThreaten(data.threaten.A.id);
    expect(again.repairProject).toBe(data.repair_project);
    expect(!!again.everRemained || Number(detail.status) === LOOPHOLE_STATUS['遗留'] || Number(again.status) === 3).toBeTruthy();
  });

  test('TC-THR-F002-03 数据威胁从未遗留已修复不写入', async ({ request }) => {
    const data = fx();
    skipNo(data.threaten?.C?.id && data.repair_project, '缺少 fixture threaten.C');
    const api = await repairProjectApiAs(request, superAdmin());
    const detail = await api.getThreaten(data.threaten.C.id);
    const old = detail.repairProject || null;
    const res = await api.updateThreaten(detail, {
      status: LOOPHOLE_STATUS['已修复'],
      repairProject: data.repair_project,
    });
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getThreaten(data.threaten.C.id);
    expect(again.repairProject || null).toBe(old);
  });
});

test.describe('5449 API · AI F-002', () => {
  test('TC-AI-F002-01 遗留→已修复 可保存编号', async ({ request }) => {
    const data = fx();
    skipNo(data.ai?.A?.id && data.repair_project, '缺少 fixture ai.A，先 prepare:5449');
    const api = await repairProjectApiAs(request, superAdmin());
    const detail = await api.getAiSecurity(data.ai.A.id);
    const res = await api.updateAiSecurity(detail, {
      status: LOOPHOLE_STATUS['已修复'],
      repairProject: data.repair_project,
    });
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getAiSecurity(data.ai.A.id);
    expect(again.repairProject).toBe(data.repair_project);
  });

  test('TC-AI-F002-03 从未遗留已修复不写入', async ({ request }) => {
    const data = fx();
    skipNo(data.ai?.C?.id && data.repair_project, '缺少 fixture ai.C');
    const api = await repairProjectApiAs(request, superAdmin());
    const detail = await api.getAiSecurity(data.ai.C.id);
    const old = detail.repairProject || null;
    const res = await api.updateAiSecurity(detail, {
      status: LOOPHOLE_STATUS['已修复'],
      repairProject: data.repair_project,
    });
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getAiSecurity(data.ai.C.id);
    expect(again.repairProject || null).toBe(old);
  });
});

test.describe('5449 API · 网络 F-005 / F-006', () => {
  test('TC-NET-002 审核通过可保存编号', async ({ request }) => {
    const data = fx();
    skipNo(data.network?.N1?.id && data.repair_project, '缺少 fixture network.N1');
    const api = await repairProjectApiAs(request, superAdmin());
    const res = await api.batchAuditCloudInfra([data.network.N1.id], 2, data.repair_project);
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getCloudInfra(data.network.N1.id);
    expect(again.repairProject).toBe(data.repair_project);
  });

  test('TC-NET-003 审核不通过不写入/不清空', async ({ request }) => {
    const data = fx();
    skipNo(data.network?.N2?.id && data.repair_project, '缺少 fixture network.N2');
    const api = await repairProjectApiAs(request, superAdmin());
    // 先通过写入
    await api.batchAuditCloudInfra([data.network.N2.id], 2, data.repair_project);
    const mid = await api.getCloudInfra(data.network.N2.id);
    expect(mid.repairProject).toBe(data.repair_project);
    // 再不通过并带新编号
    const res = await api.batchAuditCloudInfra([data.network.N2.id], 3, 'PSRB-SHOULD-NOT');
    expect(res.ok, res.err).toBeTruthy();
    const again = await api.getCloudInfra(data.network.N2.id);
    expect(again.repairProject).toBe(data.repair_project);
  });

  test('TC-NET-BAT-001 批量统一编号', async ({ request }) => {
    const data = fx();
    skipNo(data.network?.N1?.id && data.network?.N2?.id && data.repair_project, '缺少 network N1/N2');
    const api = await repairProjectApiAs(request, superAdmin());
    const code = data.repair_project;
    // 先分别置于可再审状态：不通过后再批量通过+编号
    await api.batchAuditCloudInfra([data.network.N1.id], 3);
    await api.batchAuditCloudInfra([data.network.N2.id], 3);
    const res = await api.batchAuditCloudInfra(
      [data.network.N1.id, data.network.N2.id],
      2,
      code,
    );
    expect(res.ok, res.err).toBeTruthy();
    const a = await api.getCloudInfra(data.network.N1.id);
    const b = await api.getCloudInfra(data.network.N2.id);
    expect(a.repairProject).toBe(code);
    expect(b.repairProject).toBe(code);
  });
});
