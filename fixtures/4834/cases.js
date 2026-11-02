/**
 * 对齐 AT_py cases/4834/data/cases_4834.py
 * execute set: smoke | logic；已移除 API 用例。
 * Playwright：CASE_SET / CASE_ONLY 见 playwright.config.js 与 npm scripts。
 *
 * 节点闸道 SSOT：docs/common/节点闸道规则.md + utils/node-order.js
 * 状态池 SSOT：docs/4834/造数状态池与用例消耗.md（终态不可逆；默认不免审）
 * 单节点闭环：一个节点 FP→BP→FR→BR 测完再换下一节点；FOCUS_NODE / --focus-node 钉死。
 * 冒烟顺序（run-smoke-node-order.js）：CFG → FP → BP → FR → BR → FC → BC → AUTH。
 * 造数：仅页面 prepare:4834；禁止 --via api。
 */

/** @typedef {{ id: string, fn: string|null, set: 'smoke'|'logic', skip?: string, tag?: string }} CaseMeta */

/** @type {CaseMeta[]} */
const CASES = [
  {
    id: 'SMOKE-CFG-001',
    fn: 'smoke_cfg_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-CFG-002',
    fn: 'smoke_cfg_002',
    set: 'smoke'
  },
  {
    id: 'SMOKE-FP-002',
    fn: 'smoke_fp_002',
    set: 'smoke'
  },
  {
    id: 'SMOKE-FP-003',
    fn: 'smoke_fp_003',
    set: 'smoke'
  },
  {
    id: 'SMOKE-FP-001',
    fn: 'smoke_fp_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-BP-001',
    fn: 'smoke_bp_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-BP-002',
    fn: 'smoke_bp_002',
    set: 'smoke'
  },
  {
    id: 'SMOKE-BP-003',
    fn: null,
    set: 'smoke',
    skip: '需后台节点审批直接置「审核暂停」后验前台仅申请恢复（TC-BP-022）'
  },
  {
    id: 'SMOKE-FR-001',
    fn: 'smoke_fr_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-BR-001',
    fn: 'smoke_br_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-FC-001',
    fn: 'smoke_fc_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-BC-001',
    fn: 'smoke_bc_001',
    set: 'smoke'
  },
  {
    id: 'SMOKE-AP-001',
    fn: null,
    set: 'smoke',
    skip: '需触发 overdueNodeAutoPauseExecutor；且不回溯上线前历史超期'
  },
  {
    id: 'SMOKE-PM-001',
    fn: null,
    set: 'smoke',
    skip: '需非法定假日 10:00 / pauseNodeReminderExecutor（含普通周末应发）'
  },
  {
    id: 'SMOKE-AC-001',
    fn: null,
    set: 'smoke',
    skip: '需暂停天数 > autoCloseDays；不回溯上线前历史暂停超长'
  },
  {
    id: 'SMOKE-TODO-001',
    fn: null,
    set: 'smoke',
    skip: '需后台待办页验「节点申请类型」默认条件组'
  },
  {
    id: 'SMOKE-AUTH-001',
    fn: 'smoke_auth_001',
    set: 'smoke'
  }
];

const LOGIC_FN_EXTRA = new Set([
  'tc_pm_freq_logic',
  'tc_ac_eq_not_close',
  'tc_fp_024_logic',
  'tc_fc_006_logic',
  'tc_hist_004_logic',
  'tc_cfg_010_logic',
  'tc_cfg_freq_bounds_logic',
  'tc_cfg_020_logic',
  'tc_ap_006_logic',
  'tc_ap_009_logic',
  'tc_ap_015_hist_logic',
  'tc_ac_013_hist_logic',
  'tc_pm_017_detail_url_logic',
  'tc_pm_026_weekend_logic',
  'tc_hist_007_no_backfill_logic',
  'tc_todo_002_or_logic',
]);

function isLogicCase(c) {
  if (c.tag === 'logic') return true;
  const fn = c.fn || '';
  return fn.endsWith('_logic') || LOGIC_FN_EXTRA.has(fn);
}

function isRunnable(c) {
  return Boolean(c.fn) && !c.skip;
}

/** @param {string} [name] */
function bySet(name) {
  const n = String(name || 'smoke').toLowerCase();
  if (n === 'all') return [...CASES];
  if (n === 'logic') return CASES.filter(isLogicCase);
  return CASES.filter((c) => c.set === 'smoke');
}

function coverageStats() {
  const total = CASES.length;
  const runnable = CASES.filter(isRunnable).length;
  const skipped = total - runnable;
  return { total, runnable, skipped };
}

function caseById(id) {
  return CASES.find((c) => c.id === id) || null;
}

module.exports = {
  CASES,
  bySet,
  coverageStats,
  caseById,
  isLogicCase,
  isRunnable,
};
