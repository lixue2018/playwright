/**
 * 节点顺序 / 闸道 — 全项目公共规则（机器可读）
 *
 * 文档 SSOT：docs/common/节点闸道规则.md
 * 人工与脚本一律以该文档 + 本文件为准；需求单文档只做链接，勿另抄一套。
 *
 * 口诀：先测左边 → 本闸道测完（含前台提交、后台审核）再审过 → 再测右边。
 */
const { env } = require('./env');

/** @type {string[]} 导航从左到右；终审最后（无申请暂停） */
const NODE_TEST_ORDER = [
  '基本信息',
  '架构审核',
  '数据安全',
  '隐私安全',
  '源代码安全',
  '开源组件安全',
  '基线安全',
  '渗透测试',
  'AI安全',
  '网络基础设施审核',
  '终审',
];

/** @type {Record<string, string>} 节点名 → 闸道 ID */
const GATE_OF = {
  基本信息: 'G0',
  架构审核: 'G1',
  数据安全: 'G1',
  隐私安全: 'G1',
  源代码安全: 'G1',
  开源组件安全: 'G2',
  基线安全: 'G2',
  渗透测试: 'G2',
  AI安全: 'G2',
  网络基础设施审核: 'G2',
  终审: 'G3',
};

/**
 * 闸道定义（与 docs/common/节点闸道规则.md 一致）
 * key 小写便于 CLI：--stop-at-gate g0|g1
 *
 * @type {Record<string, { id: string, nodes: string[], unlock: string, scope: string }>}
 */
const NODE_GATES = {
  g0: {
    id: 'G0',
    nodes: ['基本信息'],
    scope: '前台提交 / 后台审核 / 申请暂停等（视需求）',
    unlock: '本闸道测完后再审批通过基本信息',
  },
  g1: {
    id: 'G1',
    nodes: ['架构审核', '数据安全', '隐私安全', '源代码安全'],
    scope: '各节点前台提交文件/材料 → 后台审核；中间态用例',
    unlock: '本闸道 4 节点测完后再全部审到通过/免审等终态',
  },
  g2: {
    id: 'G2',
    nodes: ['开源组件安全', '基线安全', '渗透测试', 'AI安全', '网络基础设施审核'],
    scope: '各节点前台提交 → 后台审核；暂停/恢复等',
    unlock: '本闸道 5 节点测完后再全部审到通过/终态',
  },
  g3: {
    id: 'G3',
    nodes: ['终审'],
    scope: '前台提交 / 申请关闭 → 后台审核（无申请暂停）',
    unlock: '仅此时测终审关闭主链路',
  },
};

/**
 * 单节点闭环（少换登录）：
 * 接口人做完前台项 → 本节点审核人做完后台项 → 再换下一节点审核人。
 */
const NODE_SESSION_STEPS = [
  'front_forbid_or_enable',
  'front_submit_files',
  'admin_node_audit',
  'front_pause_empty',
  'front_pause_submit',
  'admin_pause_audit',
  'front_resume',
  'admin_resume_audit',
];

/** PSRB_FOCUS_NODE / FOCUS_NODE：钉死本轮只测该节点 */
function resolveFocusNode(fallback = '') {
  const fromEnv = String(env('PSRB_FOCUS_NODE', '') || env('FOCUS_NODE', '') || '').trim();
  if (fromEnv) return fromEnv;
  return String(fallback || '').trim();
}

/** 前台找可暂停节点：焦点优先，再按闸道从左到右（不含终审） */
function pauseNodeCandidates(preferred = '') {
  const focus = resolveFocusNode(preferred);
  const base = NODE_TEST_ORDER.filter((n) => n !== '终审');
  if (!focus) return base;
  return [focus, ...base.filter((n) => n !== focus)];
}

/** 按闸道 ID（G0/G1…）取节点列表 */
function nodesOfGate(gateId) {
  const id = String(gateId || '').toUpperCase();
  const row = Object.values(NODE_GATES).find((g) => g.id === id);
  return row ? [...row.nodes] : [];
}

module.exports = {
  NODE_TEST_ORDER,
  GATE_OF,
  NODE_GATES,
  NODE_SESSION_STEPS,
  resolveFocusNode,
  pauseNodeCandidates,
  nodesOfGate,
};
