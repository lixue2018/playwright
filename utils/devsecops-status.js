/**
 * 对齐 TabletNodeStatusAggregator（隐私/基线/渗透）纯逻辑，供 LOGIC 用例使用。
 */
const STATUS = {
  WAITING: 0,
  PENDING_REVIEW: 1,
  UNDER_REVIEW: 2,
  TO_FIX: 3,
  PASSED: 4,
  FAILED: 5,
  STATIC_OK: 6,
  SCANNING: 7,
};

const LOCATION = {
  BASELINE: 1,
  PRIVACY: 2,
  BLACK: 3,
};

/**
 * @param {number[]} logStatuses
 * @param {{ pendingProcess?: number, pendingFixOrEval?: number, hasManualChange?: boolean, location?: number }} opts
 */
function aggregateNodeStatus(logStatuses, opts = {}) {
  const {
    pendingProcess = 0,
    pendingFixOrEval = 0,
    hasManualChange = false,
    location = LOCATION.PRIVACY,
  } = opts;
  if (!logStatuses || !logStatuses.length) return null;

  let anyScanning = false;
  let anyUnderReviewLog = false;
  let anyNormalFinished = false;
  let allWaiting = true;
  let allFailed = true;
  let allStaticSuccess = true;

  for (const status of logStatuses) {
    if (status !== STATUS.WAITING) allWaiting = false;
    if (status !== STATUS.FAILED) allFailed = false;
    if (status !== STATUS.STATIC_OK) allStaticSuccess = false;
    if (status === STATUS.SCANNING) anyScanning = true;
    if (status === STATUS.UNDER_REVIEW) anyUnderReviewLog = true;
    if (
      status === STATUS.PASSED ||
      status === STATUS.PENDING_REVIEW ||
      status === STATUS.UNDER_REVIEW ||
      status === STATUS.TO_FIX
    ) {
      anyNormalFinished = true;
    }
  }

  if (allWaiting) return STATUS.WAITING;
  if (anyScanning) return STATUS.SCANNING;
  if (pendingProcess > 0) {
    return hasManualChange || anyUnderReviewLog ? STATUS.UNDER_REVIEW : STATUS.PENDING_REVIEW;
  }
  if (pendingFixOrEval > 0) return STATUS.TO_FIX;
  if (anyNormalFinished) return STATUS.PASSED;
  if (allFailed) return STATUS.FAILED;
  if (location === LOCATION.PRIVACY && allStaticSuccess) return STATUS.STATIC_OK;
  return STATUS.PASSED;
}

function isBusy(code) {
  return [STATUS.WAITING, STATUS.SCANNING, STATUS.PENDING_REVIEW, STATUS.UNDER_REVIEW].includes(code);
}

function isUnfixedCountUnavailable(code) {
  const status = code == null ? 8 : code;
  return [8, STATUS.WAITING, STATUS.SCANNING, STATUS.FAILED].includes(status);
}

module.exports = {
  STATUS,
  LOCATION,
  aggregateNodeStatus,
  isBusy,
  isUnfixedCountUnavailable,
};
