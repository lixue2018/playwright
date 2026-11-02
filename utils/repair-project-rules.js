/**
 * 5449 修复项目编号规则 — 对齐后端 RepairProjectLinkRules + 前端 useRepairProjectOptions
 *
 * 状态码：遗留=2，已修复=3；网络审核通过=2
 * 曾遗留：操作日志 content 以 " -> 遗留" 结尾
 */

const LOOPHOLE_STATUS = {
  待修复: 1,
  遗留: 2,
  已修复: 3,
  已忽略: 5,
  待复测: 8,
  已接受: 16,
  遗留评估: 18,
};

const REVIEW_PASS = 2;
const REVIEW_FAIL = 3;

/** 与 RepairProjectLinkRules.CHANGED_TO_LEGACY_SUFFIX 一致 */
const CHANGED_TO_LEGACY_SUFFIX = ' -> 遗留';

/**
 * @param {number|string|null|undefined} savedStatus 编辑前已保存状态
 * @param {number|string|null|undefined} submitStatus 本次提交状态
 * @param {boolean} everRemained 操作日志曾改为遗留
 */
function allowByLegacyFixed(savedStatus, submitStatus, everRemained) {
  return Number(submitStatus) === LOOPHOLE_STATUS['已修复']
    && (Number(savedStatus) === LOOPHOLE_STATUS['遗留'] || !!everRemained);
}

/** 网络：本次审核结果为通过 */
function allowByAuditPass(reviewStatus) {
  return String(reviewStatus) === String(REVIEW_PASS);
}

/**
 * 不允许关联或 blank 时返回 null（调用方不写库 → 保留旧值）
 * @returns {string|null}
 */
function valueToPersist(savedStatus, submitStatus, everRemained, repairProject) {
  if (!allowByLegacyFixed(savedStatus, submitStatus, everRemained)) return null;
  if (repairProject == null || String(repairProject).trim() === '') return null;
  return String(repairProject);
}

/**
 * 网络批量：仅通过且非 blank 才写入；否则保留旧值
 * @returns {string|null} null 表示不更新该列
 */
function valueToPersistForAudit(reviewStatus, repairProject) {
  if (!allowByAuditPass(reviewStatus)) return null;
  if (repairProject == null || String(repairProject).trim() === '') return null;
  return String(repairProject);
}

/**
 * 模拟一次「是否应更新编号列」后的最终库值
 * @param {string|null|undefined} oldValue
 * @param {string|null} toPersist valueToPersist 结果
 */
function applyPersist(oldValue, toPersist) {
  if (toPersist == null) return oldValue == null || oldValue === '' ? null : String(oldValue);
  return String(toPersist);
}

/** 日志 content 是否算「曾改为遗留」（后缀匹配，不含遗留评估文案） */
function isChangedToLegacyLog(content) {
  return String(content || '').endsWith(CHANGED_TO_LEGACY_SUFFIX);
}

/**
 * @param {string[]} logContents 本条漏洞相关日志 content 列表
 */
function computeEverRemained(logContents) {
  return (logContents || []).some(isChangedToLegacyLog);
}

/** 前端 editable 别名，与 repairProjectEditableByStatus 一致 */
const repairProjectEditableByStatus = allowByLegacyFixed;
const repairProjectEditableByAudit = allowByAuditPass;

/**
 * F-002 矩阵行 → 期望可编辑
 * @param {{ saved: number, everRemained: boolean, submit: number }} row
 */
function expectEditableF002(row) {
  return allowByLegacyFixed(row.saved, row.submit, row.everRemained);
}

/** 用例文档矩阵（逻辑层断言用） */
const F002_MATRIX = [
  { id: 'F002-01', saved: 2, everRemained: false, submit: 3, editable: true },
  { id: 'F002-01b', saved: 2, everRemained: true, submit: 3, editable: true },
  { id: 'F002-02', saved: 1, everRemained: true, submit: 3, editable: true },
  { id: 'F002-03', saved: 1, everRemained: false, submit: 3, editable: false },
  { id: 'F002-04', saved: 2, everRemained: true, submit: 1, editable: false },
  { id: 'F002-04b', saved: 1, everRemained: true, submit: 2, editable: false },
  { id: 'F002-05', saved: 3, everRemained: true, submit: 3, editable: true },
];

const F005_MATRIX = [
  { id: 'F005-01', review: 2, editable: true },
  { id: 'F005-02', review: 3, editable: false },
  { id: 'F005-03', review: 0, editable: false },
  { id: 'F005-04', review: undefined, editable: false },
];

module.exports = {
  LOOPHOLE_STATUS,
  REVIEW_PASS,
  REVIEW_FAIL,
  CHANGED_TO_LEGACY_SUFFIX,
  allowByLegacyFixed,
  allowByAuditPass,
  valueToPersist,
  valueToPersistForAudit,
  applyPersist,
  isChangedToLegacyLog,
  computeEverRemained,
  repairProjectEditableByStatus,
  repairProjectEditableByAudit,
  expectEditableF002,
  F002_MATRIX,
  F005_MATRIX,
};
