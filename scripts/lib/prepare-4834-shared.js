/**
 * 4834 造数：共享规格 / fixture 读写 / 绑定 / 节点闸道
 *
 * 闸道 SSOT：docs/common/节点闸道规则.md + utils/node-order.js
 * 状态池 SSOT：docs/4834/造数状态池与用例消耗.md
 *
 * 默认 shape：
 *   EM01 = pause_ok（只标记可申请节点，不免审烧左侧）
 *   EM02 = paused（置审核暂停，供恢复）
 * 旧「免审挤下一节点」：PREPARE_SACRIFICE_LEFT=1 或 shape=exempt_then_pause_ok
 * 全量中间态：--stop-at-gate，避免过早 shape/advance。
 */
const { TEST_ENV, API_BASE_URL, saveFixture, loadFixture, env } = require('../../utils/env');
const { accountsForFixture } = require('../../utils/project-audit-api');
const {
  NODE_TEST_ORDER,
  resolveFocusNode,
  GATE_OF,
  NODE_GATES,
} = require('../../utils/node-order');

const SPECS = {
  EM01: {
    index: 1,
    /** @type {'pause_ok'|'exempt_then_pause_ok'|'paused'} */
    shape: 'pause_ok',
    note:
      '状态池·pause_ok：基本信息通过后标记可申请暂停节点（默认不免审）；FOCUS 钉节点；牺牲左侧用 PREPARE_SACRIFICE_LEFT=1',
  },
  EM02: {
    index: 2,
    shape: 'paused',
    note: '状态池·paused：基本信息通过 → 目标节点置审核暂停(99)，供 FR/BR；勿与 EM01 抢同一焦点除非单节点闭环',
  },
};

/** 是否允许免审左侧以「挤出」下一可暂停节点（会制造终态，默认关） */
function sacrificeLeftEnabled() {
  const v = String(env('PREPARE_SACRIFICE_LEFT', '') || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * 写入 node_roles 快照，便于人工/用例对照状态池
 * @param {Record<string, any>} row
 * @param {Record<string, any>} nav
 */
function applyNodeRoles(row, nav) {
  const forbid = [];
  for (const [name, cell] of Object.entries(nav || {})) {
    const st = Number(cell && cell.status);
    if ([103, 101, 102, 2, 21, 100, 11].includes(st)) forbid.push(name);
  }
  row.node_roles = {
    pause_ok: row.pause_ok_node || null,
    paused: row.paused_node || null,
    forbid,
    sacrificed: row.exempt_node || null,
  };
  return row;
}

function loadData() {
  return loadFixture() || {};
}

function persist(data, note) {
  data.accounts = accountsForFixture();
  data.test_env = TEST_ENV || '';
  data.api_host = API_BASE_URL;
  data.note = note || data.note || 'prepare-4834';
  data.prepare_via = data.prepare_via || '';
  data.node_gates = NODE_GATES;
  const out = saveFixture(data);
  console.log(`[prepare-4834] fixture → ${out}`);
  return out;
}

function bindExistingProjects({ em01, em02 }) {
  const data = loadData();
  const mapping = { EM01: String(em01 || '').trim(), EM02: String(em02 || '').trim() };
  for (const [key, pid] of Object.entries(mapping)) {
    if (!pid) continue;
    const row = { ...(data[key] || {}) };
    row.project_id = pid;
    row.kind = key;
    row.note = SPECS[key].note;
    row.no_vuln = true;
    row.reused = true;
    for (const stale of [
      'last_pause_apply_id',
      'last_pause_location',
      'last_resume_apply_id',
      'last_close_apply_id',
    ]) {
      delete row[stale];
    }
    data[key] = row;
    console.log(`[prepare-4834] 绑定旧项目 ${key}=${pid}`);
  }
  if (data.EM01) {
    data.CFG01 = { ...data.EM01, kind: 'CFG01' };
  }
  persist(data, data.note);
  return data;
}

function makeVersion(key) {
  return `${env('PSRB_VERSION_PREFIX', '4834邮件提醒流程变更')}-js-${Date.now()}-${SPECS[key].index}`;
}

/**
 * --stop-at-gate 映射到实际执行的 phase 列表（在 all 展开之后裁剪）
 * g0: 只建项，不审基本信息（测 G0）
 * g1: 建项 + 审基本信息，不 shape（留下 G1 中间态）
 * （默认无 stop：create+approve+shape，冒烟最短）
 */
function phasesForStopAtGate(phases, stopAtGate) {
  const stop = String(stopAtGate || '')
    .trim()
    .toLowerCase();
  if (!stop) return phases;
  if (!NODE_GATES[stop] && stop !== 'g0' && stop !== 'g1') {
    throw new Error(`未知 --stop-at-gate=${stopAtGate}，可选 g0|g1（g2/g3 需人工推进闸道）`);
  }
  const set = new Set(phases);
  if (stop === 'g0') {
    set.delete('approve');
    set.delete('shape');
    console.log('[prepare-4834] stop-at-gate=g0 → 只 create（基本信息未审，供测 G0）');
  } else if (stop === 'g1') {
    set.delete('shape');
    console.log('[prepare-4834] stop-at-gate=g1 → create+approve，跳过 shape（G1 中间态可测）');
  }
  return ['create', 'approve', 'shape', 'advance', 'bind'].filter((p) => set.has(p));
}

function parseArgs(argv) {
  const out = {
    phase: 'all',
    only: '',
    em01: '',
    em02: '',
    via: '',
    stopAtGate: '',
    focusNode: '',
    advanceGate: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--phase') out.phase = argv[++i] || out.phase;
    else if (a.startsWith('--phase=')) out.phase = a.slice('--phase='.length);
    else if (a === '--only') out.only = argv[++i] || '';
    else if (a.startsWith('--only=')) out.only = a.slice('--only='.length);
    else if (a === '--em01') out.em01 = argv[++i] || '';
    else if (a.startsWith('--em01=')) out.em01 = a.slice('--em01='.length);
    else if (a === '--em02') out.em02 = argv[++i] || '';
    else if (a.startsWith('--em02=')) out.em02 = a.slice('--em02='.length);
    else if (a === '--via') out.via = argv[++i] || '';
    else if (a.startsWith('--via=')) out.via = a.slice('--via='.length);
    else if (a === '--stop-at-gate') out.stopAtGate = argv[++i] || '';
    else if (a.startsWith('--stop-at-gate=')) out.stopAtGate = a.slice('--stop-at-gate='.length);
    else if (a === '--focus-node') out.focusNode = argv[++i] || '';
    else if (a.startsWith('--focus-node=')) out.focusNode = a.slice('--focus-node='.length);
    else if (a === '--advance-gate') out.advanceGate = argv[++i] || '';
    else if (a.startsWith('--advance-gate=')) out.advanceGate = a.slice('--advance-gate='.length);
  }
  out.em01 = out.em01 || env('EM01') || env('PSRB_EM01') || '';
  out.em02 = out.em02 || env('EM02') || env('PSRB_EM02') || '';
  out.stopAtGate = out.stopAtGate || env('PREPARE_STOP_AT_GATE', '') || '';
  out.focusNode = out.focusNode || env('PSRB_FOCUS_NODE', '') || env('FOCUS_NODE', '') || '';
  out.advanceGate = out.advanceGate || env('PREPARE_ADVANCE_GATE', '') || '';
  // 默认页面造数；已禁用 PREPARE_VIA=api
  out.via = 'ui';
  return out;
}

module.exports = {
  NODE_GATES,
  NODE_TEST_ORDER,
  GATE_OF,
  SPECS,
  loadData,
  persist,
  bindExistingProjects,
  makeVersion,
  parseArgs,
  phasesForStopAtGate,
  resolveFocusNode,
  sacrificeLeftEnabled,
  applyNodeRoles,
};
