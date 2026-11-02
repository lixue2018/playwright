/**
 * 4834 纯 API 造数 — 克隆建项 + audits 打节点态。
 * 仅供 api-datagen/ 使用；页面冒烟请用 scripts/prepare-4834.js。
 */
const { NODE_LOCATION } = require('../../utils/rules');
const {
  createProjectFromTemplate,
  approveNode,
  navRows,
  navMap,
  dumpNav,
  firstOpenSecurityNode,
} = require('../../utils/project-audit-api');
const {
  SPECS,
  loadData,
  persist,
  makeVersion,
  sacrificeLeftEnabled,
  applyNodeRoles,
  resolveFocusNode,
} = require('../../scripts/lib/prepare-4834-shared');

function canPauseApi(st) {
  const n = Number(st);
  return ![103, 101, 102, 2, 21, 99, 11, 100].includes(n);
}

async function phaseCreate(request, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'api';
  for (const key of keys) {
    const version = makeVersion(key);
    console.log(`\n===== ${key} create(API) version=${version} =====`);
    const { projectId, version: ver } = await createProjectFromTemplate(request, { version });
    const row = { ...(data[key] || {}) };
    Object.assign(row, {
      project_id: String(projectId),
      product_version: ver,
      kind: key,
      note: SPECS[key].note,
      no_vuln: true,
      basic_approved: false,
      pause_ok_node: null,
      pause_ok_location: null,
      pause_ok_second_audit: 0,
    });
    delete row.exempt_node;
    delete row.paused_node;
    delete row.paused_location;
    delete row.paused_second_audit;
    delete row.advanced_gate;
    delete row.advanced_nodes;
    delete row.last_pause_apply_id;
    delete row.last_pause_location;
    delete row.last_resume_apply_id;
    delete row.last_close_apply_id;
    data[key] = row;
    console.log(`OK ${key} project_id=${projectId}`);
  }
  data.CFG01 = { ...(data.EM01 || {}), kind: 'CFG01' };
  persist(data, '由 api-datagen/prepare-4834.js 生成（API 建项+打节点态）');
  return data;
}

async function phaseApprove(request, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'api';
  for (const key of keys) {
    const row = data[key] || {};
    const pid = String(row.project_id || '').trim();
    if (!pid) {
      console.log(`skip ${key}: 无 project_id`);
      continue;
    }
    const nav = navMap(await navRows(request, pid));
    const basic = nav['基本信息'];
    const st = basic != null ? Number(basic.status) : null;
    if (st === 2 || st === 21) {
      console.log(`跳过基本信息审批 ${key}=${pid}（已通过，状态码 ${st}）`);
      row.basic_approved = true;
      data[key] = row;
      continue;
    }
    if (row.basic_approved && st !== 2 && st !== 21) {
      console.log(`忽略残留 basic_approved：${key}=${pid} 当前状态=${st}，继续审批`);
      row.basic_approved = false;
    }
    console.log(`审批基本信息(API) ${key}=${pid} 当前状态=${st}`);
    await approveNode(request, pid, '基本信息', {
      approvalResult: '审批通过',
      remark: '4834造数-基本信息通过',
    });
    row.basic_approved = true;
    data[key] = row;
  }
  persist(data, '由 api-datagen/prepare-4834.js 生成（API 建项+打节点态）');
}

async function phaseShape(request, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'api';
  const stats = { ok: 0, skip: 0, fail: 0, rows: [] };

  for (const key of keys) {
    const spec = SPECS[key];
    const row = data[key] || {};
    const pid = String(row.project_id || '').trim();
    if (!pid) {
      console.log(`跳过 ${key}：无项目编号`);
      stats.skip += 1;
      stats.rows.push(`${key} 跳过（无项目编号）`);
      continue;
    }
    let nav = navMap(await navRows(request, pid));
    const focus = resolveFocusNode(row.pause_ok_node || row.paused_node || '');
    const avoid =
      key === 'EM02' && data.EM01 && data.EM01.pause_ok_node
        ? String(data.EM01.pause_ok_node)
        : '';
    let target = focus && nav[focus] ? focus : null;
    if (!target) {
      const open = firstOpenSecurityNode(nav);
      if (avoid && open === avoid) {
        const alt = Object.keys(nav).find(
          (n) => n !== avoid && n !== '基本信息' && n !== '终审' && canPauseApi(nav[n].status),
        );
        target = alt || open;
      } else {
        target = open;
      }
    }
    if (!target) target = focus || '架构审核';
    const shape = String(spec.shape || '');
    const doSacrifice =
      shape === 'exempt_then_pause_ok' || (shape === 'pause_ok' && sacrificeLeftEnabled());
    console.log(`${key} shape(API)=${shape}${doSacrifice ? '+sacrifice' : ''} target_node=${target}`);

    try {
      if (shape === 'pause_ok' || shape === 'exempt_then_pause_ok') {
        if (doSacrifice) {
          console.log(`  ⚠ 牺牲左侧：免审「${target}」`);
          await approveNode(request, pid, target, {
            approvalResult: '免审',
            remark: '4834造数-免审(sacrifice)',
          });
          row.exempt_node = target;
          nav = navMap(await navRows(request, pid));
        }
        const pauseNode =
          (focus && nav[focus] && canPauseApi(nav[focus].status) && focus) ||
          firstOpenSecurityNode(nav);
        row.pause_ok_node = pauseNode || null;
        if (pauseNode) {
          const [loc, sa] = NODE_LOCATION[pauseNode] || [null, 0];
          row.pause_ok_location = loc;
          row.pause_ok_second_audit = sa;
        }
      } else if (shape === 'paused') {
        const st = nav[target] != null ? Number(nav[target].status) : null;
        if (st === 99) {
          console.log(`  ${target} 已是审核暂停，跳过再置暂停`);
          row.paused_node = target;
        } else if ([11, 2, 21, 101, 102, 100].includes(st)) {
          console.log(`  ${target} 已终态 status=${st}，无法再置暂停 → 跳过`);
          stats.skip += 1;
          stats.rows.push(`${key} 跳过（目标已终态）`);
          console.log(`跳过 ${key}`);
          continue;
        } else {
          await approveNode(request, pid, target, {
            approvalResult: '审核暂停',
            remark: '4834造数-审核暂停',
          });
          row.paused_node = target;
        }
        const [loc, sa] = NODE_LOCATION[row.paused_node || target] || [2, 0];
        row.paused_location = loc;
        row.paused_second_audit = sa;
      }

      const navFinal = navMap(await navRows(request, pid));
      row.nav = dumpNav(navFinal);
      applyNodeRoles(row, navFinal);
      const finalRow = navFinal['终审'] || navFinal['项目终审'];
      row.final_status = finalRow ? finalRow.status : null;
      row.final_location = 10;
      data[key] = row;

      if ((shape === 'pause_ok' || shape === 'exempt_then_pause_ok') && !row.pause_ok_node) {
        stats.skip += 1;
        stats.rows.push(`${key} 未找到可申请暂停节点`);
        console.log(`跳过 ${key}：无可申请暂停节点`);
      } else {
        stats.ok += 1;
        const tip =
          shape === 'paused'
            ? `已暂停节点=${row.paused_node || '无'}`
            : `可申请暂停节点=${row.pause_ok_node || '无'}`;
        stats.rows.push(`${key} 成功：${tip}`);
        console.log(`OK ${key} pause_ok=${row.pause_ok_node || '-'} paused=${row.paused_node || '-'}`);
      }
    } catch (e) {
      stats.fail += 1;
      stats.rows.push(`${key} 失败：${String(e.message || e).slice(0, 120)}`);
      throw e;
    }
  }

  if (data.EM01) data.CFG01 = { ...data.EM01, kind: 'CFG01' };
  persist(data, '由 api-datagen/prepare-4834.js 生成（API 建项+打节点态）');
  return stats;
}

module.exports = { phaseCreate, phaseApprove, phaseShape };
