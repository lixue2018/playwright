/**
 * DevSecOps 优化需求 — fixture key 与期望（造数回填 JSON 后由冒烟读取）
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
  NOT_OPENED: 8,
};

const LOCATION = {
  BASELINE: 1,
  PRIVACY: 2,
  BLACK: 3,
  SOURCE: 4,
};

/** @type {Record<string, { title: string, expectStatus?: number, assertLocation?: number }>} */
const CASES = {
  OFF01: { title: '全节点未开启', expectStatus: STATUS.NOT_OPENED, assertLocation: LOCATION.SOURCE },
  WAIT01: { title: '等待扫描', expectStatus: STATUS.WAITING, assertLocation: LOCATION.PRIVACY },
  SCAN01: { title: '扫描中', expectStatus: STATUS.SCANNING, assertLocation: LOCATION.BASELINE },
  PEND01: { title: '待人工审核', expectStatus: STATUS.PENDING_REVIEW, assertLocation: LOCATION.PRIVACY },
  REV01: { title: '审核中', expectStatus: STATUS.UNDER_REVIEW, assertLocation: LOCATION.PRIVACY },
  FIX01: { title: '漏洞待修复', expectStatus: STATUS.TO_FIX, assertLocation: LOCATION.BASELINE },
  PASS01: { title: '扫描通过', expectStatus: STATUS.PASSED, assertLocation: LOCATION.PRIVACY },
  FAIL01: { title: '扫描失败', expectStatus: STATUS.FAILED, assertLocation: LOCATION.BASELINE },
  STATIC01: { title: '隐私静态检测成功', expectStatus: STATUS.STATIC_OK, assertLocation: LOCATION.PRIVACY },
  MIX01: { title: '批次混合失败+通过', expectStatus: STATUS.PASSED, assertLocation: LOCATION.PRIVACY },
  MIX02: { title: '扫描中压待审', expectStatus: STATUS.SCANNING, assertLocation: LOCATION.PRIVACY },
  BRANCH01: { title: '多分支', assertLocation: LOCATION.PRIVACY },
  WIN01: { title: 'Windows渗透无初审', expectStatus: STATUS.TO_FIX, assertLocation: LOCATION.BLACK },
  SRC01: { title: '源码双工具', assertLocation: LOCATION.SOURCE },
  SRC02: { title: '源码仅Coverity', assertLocation: LOCATION.SOURCE },
  FILTER01: { title: '跨节点筛选', assertLocation: LOCATION.PRIVACY },
  CNT01: { title: '待修复数量', expectStatus: STATUS.TO_FIX, assertLocation: LOCATION.BASELINE },
  BUSY01: { title: '忙状态', assertLocation: LOCATION.PRIVACY },
};

module.exports = { STATUS, LOCATION, CASES };
