/**
 * 对齐 AT_py KEEP_BROWSER：失败时保留浏览器供人工复看。
 * 默认开启；KEEP_BROWSER=0 关闭。
 */
const readline = require('readline');

/** 同一失败只 pause 一次（dispose + afterEach 共用） */
let _pausedThisFailure = false;

function keepBrowserEnabled() {
  if (process.env.CI === '1' || process.env.CI === 'true') {
    // CI 默认不留窗；显式 KEEP_BROWSER=1 仍可开（会挂起 BROWSER_HOLD_SEC）
    if (!['1', 'true', 'yes'].includes(String(process.env.KEEP_BROWSER || '').trim().toLowerCase())) {
      return false;
    }
  }
  return !['0', 'false', 'no'].includes(String(process.env.KEEP_BROWSER ?? '1').trim().toLowerCase());
}

function browserHoldMs() {
  const sec = Number(process.env.BROWSER_HOLD_SEC || 600);
  return (Number.isFinite(sec) && sec > 0 ? sec : 600) * 1000;
}

async function waitForEnter(prompt = '[keep-browser] 复看完后按 Enter 继续…') {
  if (!process.stdin.isTTY) {
    const ms = browserHoldMs();
    console.log(`[keep-browser] 非交互环境，挂起 ${ms / 1000}s（仍不关浏览器）`);
    await new Promise((r) => setTimeout(r, ms));
    return;
  }
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${prompt}\n`, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * 失败时暂停：优先 Playwright Inspector（page.pause），再等 Enter。
 * 调用方应在此后不要 close context。
 */
/** 允许同一脚本内多次 pause（全量 UI 逐条失败截图） */
function resetPauseFlag() {
  _pausedThisFailure = false;
}

async function pauseKeepBrowser(page, reason = '') {
  if (!keepBrowserEnabled()) return;
  if (_pausedThisFailure) {
    console.log('[keep-browser] 已暂停过，跳过重复 pause');
    return;
  }
  _pausedThisFailure = true;

  let url = '(no page)';
  try {
    if (page && !page.isClosed()) url = page.url();
  } catch {
    /* ignore */
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log('[keep-browser] 检测到 FAIL/异常 → 浏览器保持打开，请人工复看');
  if (reason) console.log(`[keep-browser] 原因: ${reason}`);
  console.log(`[keep-browser] 当前页: ${url}`);
  console.log('[keep-browser] Inspector 里点 Resume 后，再回终端按 Enter');
  console.log(`${'='.repeat(60)}\n`);

  if (page && !page.isClosed()) {
    try {
      await page.pause();
    } catch (err) {
      console.log(`[keep-browser] page.pause 不可用: ${err.message || err}`);
    }
  }
  await waitForEnter();
}

/**
 * 不再关闭浏览器 / context。失败时 pause 留窗。
 * @returns {Promise<boolean>} 始终 false（窗口未关）
 */
async function closeUnlessKeep(_context, { failed = false, page = null, reason = '' } = {}) {
  if (failed && keepBrowserEnabled()) {
    await pauseKeepBrowser(page, reason);
  }
  return false;
}

/** 在 describe 内调用：fixture page 失败时同样 pause */
function installKeepBrowserHooks(test) {
  test.beforeEach(() => {
    _pausedThisFailure = false;
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (!keepBrowserEnabled()) return;
    if (testInfo.status === 'skipped') return;
    if (testInfo.status === testInfo.expectedStatus) return;
    const reason = testInfo.error?.message || `${testInfo.title} → ${testInfo.status}`;
    let p = page;
    try {
      if (!p || p.isClosed()) p = null;
    } catch {
      p = null;
    }
    await pauseKeepBrowser(p, reason);
  });
}

module.exports = {
  keepBrowserEnabled,
  pauseKeepBrowser,
  resetPauseFlag,
  closeUnlessKeep,
  installKeepBrowserHooks,
  waitForEnter,
};
