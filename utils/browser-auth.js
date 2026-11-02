const { fetchAccessToken, injectAdminAuth, injectFrontAuth } = require('./api-helper');
const { ADMIN_BASE_URL, FRONT_BASE_URL } = require('./env');
const { closeUnlessKeep, keepBrowserEnabled } = require('./keep-browser');

/**
 * 复用同一 Browser 下已有 Context（同一窗口多标签）；没有则新建一个。
 * 注意：Playwright 每个 newContext ≈ 新窗口，故禁止为换账号再 newContext。
 */
function sharedContext(browser, side = 'admin') {
  const existing = browser.contexts().filter((c) => {
    try {
      return c.pages && typeof c.newPage === 'function';
    } catch {
      return false;
    }
  });
  if (existing.length) return existing[0];
  return null;
}

async function ensureSharedContext(browser, side = 'admin') {
  let context = sharedContext(browser, side);
  if (context) return context;
  return browser.newContext({
    // 仅作相对路径兜底；节点/邮件路径已改为绝对 URL
    baseURL: side === 'admin' ? ADMIN_BASE_URL : FRONT_BASE_URL,
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
    viewport: null,
  });
}

/** 在当前标签写入登录态（覆盖 storageState / 上一账号） */
async function paintAuth(page, side, token) {
  const base = (side === 'admin' ? ADMIN_BASE_URL : FRONT_BASE_URL).replace(/\/$/, '');
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  });
  if (side === 'admin') {
    await page.evaluate((rawToken) => {
      window.localStorage.setItem('Admin-Token', JSON.stringify(rawToken));
      document.cookie = `Admin-Authorization=${rawToken}; path=/`;
      document.cookie = `Admin-Authorization=${rawToken}; path=/admin`;
      document.cookie = `Authorization=Bearer ${rawToken}; path=/`;
    }, token);
  } else {
    const blob = JSON.stringify({ token });
    await page.evaluate(
      ({ blobJson, rawToken }) => {
        window.localStorage.setItem('Portal-Token', blobJson);
        document.cookie = `Portal-Authorization=${rawToken}; path=/`;
        document.cookie = `Authorization=Bearer ${rawToken}; path=/`;
      },
      { blobJson: blob, rawToken: token },
    );
  }
  // 后续同页跳转仍带上 init（SPA 深链）
  if (side === 'admin') await injectAdminAuth(page, token);
  else await injectFrontAuth(page, token);
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {{ itCode: string, side?: 'admin'|'front' }} opts
 */
async function newAuthedPage(browser, request, { itCode, side = 'admin' }) {
  const token = await fetchAccessToken(request, itCode);
  const context = await ensureSharedContext(browser, side);
  const page = await context.newPage();
  await paintAuth(page, side, token);

  return {
    context,
    page,
    token,
    /**
     * 成功：只关当前标签，保留窗口。
     * 失败 + KEEP_BROWSER：留标签不关。
     */
    async dispose({ failed = false, reason = '' } = {}) {
      if (failed && keepBrowserEnabled()) {
        return closeUnlessKeep(context, { failed: true, page, reason });
      }
      try {
        if (page && !page.isClosed()) await page.close({ runBeforeUnload: false });
      } catch {
        /* ignore */
      }
      return false;
    },
  };
}

/**
 * UI 会话包装：异常时保留浏览器并 pause。
 * @template T
 * @param {{ page: import('@playwright/test').Page, dispose: Function }} session
 * @param {(page: import('@playwright/test').Page) => Promise<T>} fn
 */
async function withUiSession(session, fn) {
  try {
    const result = await fn(session.page);
    await session.dispose({ failed: false });
    return result;
  } catch (err) {
    await session.dispose({ failed: true, reason: err.message || String(err) });
    throw err;
  }
}

module.exports = { newAuthedPage, withUiSession, paintAuth, ensureSharedContext };
