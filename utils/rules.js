/**
 * 对齐 AT_py cases/4834/api/rules.py（纯函数 + 状态码）
 */
const DEFAULT_AUTO_CLOSE_DAYS = 60;
const DEFAULT_FREQUENCY = 5;
const DEFAULT_AUTO_PAUSE_DAYS = 7;

const ST_PASS = 2;
const ST_REJECT = 3;
const ST_PASS_LEFT = 21;
const ST_SUBMIT = 4;
const ST_CLOSED = 11;
const ST_PAUSE = 99;
const ST_EXEMPT = 101;
const ST_EXEMPT_LEFT = 102;
const ST_NOT_OPEN = 103;
const ST_AUDITING = 1;
const ST_PENDING_AUDIT = 17;
const ST_FIX = 18;

/** 基线/隐私/AI/渗透：secondAudit≠0 视为子节点 */
const SUB_NODE_LOCATIONS = new Set([8, 3, 11, 7]);

const PAUSE_FORBIDDEN = new Set([
  ST_NOT_OPEN,
  ST_EXEMPT,
  ST_EXEMPT_LEFT,
  ST_PASS,
  ST_PASS_LEFT,
  ST_PAUSE,
  ST_CLOSED,
]);

const CLOSE_FORBIDDEN = new Set([ST_PASS, ST_PASS_LEFT, ST_CLOSED]);

const STATUS_LABEL = {
  1: '审核中',
  2: '审核通过',
  3: '审批不通过',
  21: '审批通过(遗留漏洞)',
  4: '待提交',
  11: '已关闭',
  17: '待审批',
  18: '漏洞待修复',
  88: '排队中',
  99: '审核暂停',
  100: '不适用',
  101: '免审',
  102: '免审(遗留漏洞)',
  103: '未开启',
};

/** 节点中文名 → [location, secondAudit] */
const NODE_LOCATION = {
  基本信息: [1, 0],
  架构审核: [2, 0],
  数据安全: [23, 0],
  隐私安全: [3, 0],
  源代码安全: [5, 0],
  开源组件安全: [6, 0],
  渗透测试: [7, 0],
  基线安全: [8, 0],
  AI安全: [11, 0],
  终审: [10, 0],
  项目终审: [10, 0],
  网络基础设施审核: [40, 0],
};

const NAV_INDEX_TO_NAME = {
  basic: '基本信息',
  frame: '架构审核',
  datasafe: '数据安全',
  privacy: '隐私安全',
  white: '源代码安全',
  osc: '开源组件安全',
  app: '基线安全',
  black: '渗透测试',
  ai: 'AI安全',
  scans: '网络基础设施审核',
  final_audit: '终审',
};

const LOC_TO_NAME = Object.fromEntries(
  Object.entries(NODE_LOCATION).map(([name, [loc]]) => [loc, name]),
);

/** 审批结果文案 → status 码 */
const APPROVAL_STATUS = {
  审批通过: ST_PASS,
  通过: ST_PASS,
  审批通过遗留漏洞: ST_PASS_LEFT,
  '通过（遗留漏洞）': ST_PASS_LEFT,
  '通过(遗留漏洞)': ST_PASS_LEFT,
  审批不通过: 3,
  不通过: 3,
  不适用: 100,
  免审: ST_EXEMPT,
  审核暂停: ST_PAUSE,
  材料待更新: 19,
};

/** 节点 → 后台 audits 路径（相对 /api） */
const NODE_AUDIT_PATH = {
  基本信息: '/detectionprojects/detectionProjectsBase/audits',
  架构审核: '/detectionprojects/detectionProjectsArchitecture/audits',
  数据安全: '/detectionprojects/detectionProjectsDataSecurity/audits',
  隐私安全: '/detectionprojects/detectionProjectsPrivacy/audits',
  源代码安全: '/detectionprojects/detectionProjectsSource/audits',
  开源组件安全: '/detectionprojects/detectionProjectsOpenSource/audits',
  基线安全: '/detectionprojects/detectionProjectsApp/audits',
  渗透测试: '/detectionprojects/detectionProjectsBlack/audits',
  AI安全: '/detectionprojects/detectionProjectsAi/audits',
  网络基础设施审核: '/detectionprojects/detectionProjectsInfrastructure/audits',
  终审: '/detectionprojects/detectionProjectsFinal/audits',
  项目终审: '/detectionprojects/detectionProjectsFinal/audits',
};

function canPause(reviewStatus) {
  if (reviewStatus == null) return false;
  return !PAUSE_FORBIDDEN.has(Number(reviewStatus));
}

function canClose(reviewStatus) {
  if (reviewStatus == null) return true;
  return !CLOSE_FORBIDDEN.has(Number(reviewStatus));
}

function isFrequencyPoint(maxPauseDays, frequency) {
  const freq = Number(frequency) < 1 ? DEFAULT_FREQUENCY : Number(frequency);
  return Number(maxPauseDays) >= freq && Number(maxPauseDays) % freq === 0;
}

function autoCloseCountdown(autoCloseDays, maxPauseDays) {
  return Math.max(Number(autoCloseDays) - Number(maxPauseDays), 0);
}

/** 与 PausedProjectAutoCloseServiceImpl：maxPauseDays > autoCloseDays 才关 */
function shouldAutoClose(maxPauseDays, autoCloseDays) {
  return Number(maxPauseDays) > Number(autoCloseDays);
}

function resolveFrequency(frequency) {
  if (frequency == null || Number(frequency) < 1) return DEFAULT_FREQUENCY;
  return Number(frequency);
}

function resolveAutoCloseDays(days) {
  if (days == null || Number(days) < 1) return DEFAULT_AUTO_CLOSE_DAYS;
  return Number(days);
}

/** 脏数据 null/≤0 回落默认 7 */
function resolveAutoPauseDays(days) {
  if (days == null || Number(days) <= 0) return DEFAULT_AUTO_PAUSE_DAYS;
  return Number(days);
}

/** 取 days≤maxPauseDays 的最后一条（按 days 升序扫描） */
function matchRule(rules, maxPauseDays) {
  if (!rules || !rules.length) return null;
  let matched = null;
  const sorted = rules
    .filter((r) => r && typeof r === 'object' && r.days != null)
    .slice()
    .sort((a, b) => Number(a.days) - Number(b.days));
  for (const item of sorted) {
    if (Number(maxPauseDays) >= Number(item.days)) matched = item;
  }
  return matched;
}

function isSubNode(location, secondAudit = 0) {
  const sa = secondAudit == null ? 0 : Number(secondAudit);
  return sa !== 0 && SUB_NODE_LOCATIONS.has(Number(location || 0));
}

/** 邮件节点表：暂停天数降序，天数相同按 location 升序 */
function sortPauseMailItems(items) {
  return (items || []).slice().sort((a, b) => {
    const d = Number(b.pauseDays || 0) - Number(a.pauseDays || 0);
    if (d !== 0) return d;
    return Number(a.location || 0) - Number(b.location || 0);
  });
}

function topPauseMailItems(items, limit = 5) {
  return sortPauseMailItems(items).slice(0, limit);
}

/** 全空或全部 status=0 则不发暂停提醒 */
function noEnabledNodes(nodes) {
  if (!nodes || !nodes.length) return true;
  return nodes
    .filter((n) => n && typeof n === 'object')
    .every((n) => Number(n.status == null ? 1 : n.status) === 0);
}

/**
 * PRD：工作日+周六日正常发送；仅法定节假日跳过。
 * isStatutoryHoliday: true 不发 / false 发 / null 接口失败不发
 */
function shouldSendPauseReminder({ isStatutoryHoliday, isWeekend = false } = {}) {
  void isWeekend;
  if (isStatutoryHoliday == null) return false;
  return !Boolean(isStatutoryHoliday);
}

function maxPauseDaysAmong(activePaused) {
  const days = (activePaused || [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => Number(x.pauseDays || 0));
  return days.length ? Math.max(...days) : 0;
}

/** 暂停定时邮件【查看详情】→ 前台基本信息节点 location=1 */
function pauseMailDetailLocation() {
  return 1;
}

function todoApplyTypeOrMatch({ applyTypeHit, projectOrNodeStatusHit } = {}) {
  return Boolean(applyTypeHit) || Boolean(projectOrNodeStatusHit);
}

/** AP/AC：上线前历史超期/超长不回溯触发 */
function shouldBackfillHistoricalAutoJob({ createdBeforeRelease } = {}) {
  return !Boolean(createdBeforeRelease);
}

function resolveApprovalStatus(labelOrCode) {
  if (labelOrCode == null || labelOrCode === '') return ST_PASS;
  if (typeof labelOrCode === 'number' || /^\d+$/.test(String(labelOrCode))) {
    return Number(labelOrCode);
  }
  const key = String(labelOrCode).trim();
  if (APPROVAL_STATUS[key] != null) return APPROVAL_STATUS[key];
  throw new Error(`未知审批结果: ${labelOrCode}`);
}

function codeOk(body) {
  return body && (body.code === 0 || body.code === 200);
}

function msgOf(body) {
  if (!body || typeof body !== 'object') return '';
  return String(body.msg || body.message || body.error || '').trim();
}

/** 期望接口失败且 msg 命中任一关键词 */
function assertFailContains(body, needles, hint = '') {
  if (codeOk(body)) {
    throw new Error(`${hint || 'assertFail'} 期望失败却成功: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const msg = msgOf(body);
  const list = Array.isArray(needles) ? needles : [needles];
  if (!list.some((n) => n && msg.includes(String(n)))) {
    throw new Error(
      `${hint || 'assertFail'} 期望 msg 含 ${JSON.stringify(list)}，实际=${msg || JSON.stringify(body).slice(0, 200)}`,
    );
  }
}

function assertOk(body, hint = '') {
  if (!codeOk(body)) {
    throw new Error(`${hint || 'assertOk'} 失败: ${msgOf(body) || JSON.stringify(body).slice(0, 300)}`);
  }
}

function locPauseOk(row) {
  const focus = String(process.env.PSRB_FOCUS_NODE || process.env.FOCUS_NODE || '')
    .trim();
  if (focus && NODE_LOCATION[focus]) {
    return NODE_LOCATION[focus];
  }
  if (row && row.pause_ok_location != null && row.pause_ok_location !== '') {
    return [Number(row.pause_ok_location), Number(row.pause_ok_second_audit || 0)];
  }
  const name = (row && row.pause_ok_node) || '数据安全';
  return NODE_LOCATION[name] || [23, 0];
}

function locPaused(row) {
  if (row && row.paused_location) {
    return [Number(row.paused_location), Number(row.paused_second_audit || 0)];
  }
  return NODE_LOCATION[(row && row.paused_node) || '架构审核'] || [2, 0];
}

module.exports = {
  DEFAULT_AUTO_CLOSE_DAYS,
  DEFAULT_FREQUENCY,
  DEFAULT_AUTO_PAUSE_DAYS,
  ST_PASS,
  ST_REJECT,
  ST_PASS_LEFT,
  ST_SUBMIT,
  ST_PAUSE,
  ST_EXEMPT,
  ST_EXEMPT_LEFT,
  ST_NOT_OPEN,
  ST_CLOSED,
  ST_AUDITING,
  ST_PENDING_AUDIT,
  ST_FIX,
  PAUSE_FORBIDDEN,
  CLOSE_FORBIDDEN,
  SUB_NODE_LOCATIONS,
  STATUS_LABEL,
  NODE_LOCATION,
  NAV_INDEX_TO_NAME,
  LOC_TO_NAME,
  APPROVAL_STATUS,
  NODE_AUDIT_PATH,
  canPause,
  canClose,
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
  resolveApprovalStatus,
  codeOk,
  msgOf,
  assertOk,
  assertFailContains,
  locPauseOk,
  locPaused,
};
