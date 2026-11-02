/**
 * 从【页面自己发起的】getNavStatus 响应读取节点态。
 * 不直接用 APIRequestContext 调业务接口造数/读数。
 */
const { frontNodePath } = require('./env');
const { NAV_INDEX_TO_NAME, LOC_TO_NAME, STATUS_LABEL, canPause, canClose } = require('./rules');

function navMap(rows) {
  const out = {};
  for (const row of rows || []) {
    const index = String(row.index || '').trim();
    if (index === 'dividingLine') continue;
    const loc = row.location;
    const name = NAV_INDEX_TO_NAME[index] || LOC_TO_NAME[Number(loc)] || index;
    if (name) out[name] = row;
  }
  return out;
}

function dumpNav(nav) {
  const rows = [];
  for (const [name, row] of Object.entries(nav || {})) {
    const st = row.status;
    const loc = row.location;
    rows.push({
      name,
      status: st,
      status_label: STATUS_LABEL[Number(st)] || String(st ?? ''),
      location: loc,
      can_pause: canPause(st),
      can_close:
        name === '终审' || name === '项目终审' || Number(loc) === 10 ? canClose(st) : false,
    });
  }
  return rows;
}

function firstOpenSecurityNode(nav) {
  const { resolveFocusNode, pauseNodeCandidates } = require('./node-order');
  const skip = new Set(['基本信息', '终审', '项目终审']);
  const focus = resolveFocusNode();
  if (focus && !skip.has(focus) && nav[focus] && canPause(nav[focus].status)) {
    return focus;
  }
  const order = pauseNodeCandidates().filter((n) => !skip.has(n));
  for (const name of order) {
    const row = nav[name];
    if (!row || skip.has(name)) continue;
    if (canPause(row.status)) return name;
  }
  for (const [name, row] of Object.entries(nav)) {
    if (skip.has(name)) continue;
    if (canPause(row.status)) return name;
  }
  return null;
}

function isNavStatusUrl(url) {
  return /getNavStatus/i.test(String(url || ''));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string|number} projectId
 * @param {string} [nodeName]
 * @returns {Promise<Record<string, any>>}
 */
async function readNavMapFromPage(page, projectId, nodeName = '基本信息') {
  const gotoPromise = page.goto(frontNodePath(projectId, nodeName), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const respPromise = page.waitForResponse(
    (r) => isNavStatusUrl(r.url()) && r.request().method() === 'GET' && r.ok(),
    { timeout: 45_000 },
  );
  const [, resp] = await Promise.all([gotoPromise, respPromise.catch(() => null)]);
  let body = resp ? await resp.json().catch(() => null) : null;
  if (!body || !Array.isArray(body.data)) {
    // 已在项目内时可能不重拉：点左侧基本信息或刷新
    const retry = page.waitForResponse(
      (r) => isNavStatusUrl(r.url()) && r.ok(),
      { timeout: 20_000 },
    );
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    const r2 = await retry.catch(() => null);
    body = r2 ? await r2.json().catch(() => null) : null;
  }
  if (!body || !Array.isArray(body.data)) {
    throw new Error(`页面未捕获到 getNavStatus（project=${projectId}），请确认已登录前台`);
  }
  return navMap(body.data);
}

module.exports = {
  navMap,
  dumpNav,
  firstOpenSecurityNode,
  readNavMapFromPage,
  isNavStatusUrl,
};
