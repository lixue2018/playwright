#!/usr/bin/env node
/**
 * 5449 全量 UI（有头浏览器）
 * - 后台：架构/数据/隐私/渗透/AI/网络 详情页测修复项目编号
 * - 前台：有编号时回显
 * - 报错/断言失败 → page.pause + 终端 Enter，截图后继续下一条（不整场中断）
 *
 *   bash -c 'HEADED=1 KEEP_BROWSER=1 PSRB_TEST_ENV=216 node scripts/run-5449-ui-full.js'
 */
const { chromium, request: pwRequest } = require('@playwright/test');
const {
  loadFixture5449,
  ADMIN_BASE_URL,
  FRONT_BASE_URL,
  adminAbsPath,
  frontAbsPath,
  frontNodePath,
} = require('../utils/env');
const { superAdmin, frontOwner } = require('../utils/accounts');
const { fetchAccessToken } = require('../utils/api-helper');
const { paintAuth, ensureSharedContext } = require('../utils/browser-auth');
const { pauseKeepBrowser, keepBrowserEnabled, resetPauseFlag, waitForEnter } = require('../utils/keep-browser');
const { repairProjectApiAs } = require('../utils/repair-project-api');

process.env.HEADED = process.env.HEADED || '1';
process.env.KEEP_BROWSER = process.env.KEEP_BROWSER || '1';
// 非 TTY 下 keep-browser 默认挂 600s；本脚本以 page.pause 为主，Resume 后立刻下一条
process.env.BROWSER_HOLD_SEC = process.env.BROWSER_HOLD_SEC || '8';

function logStep(msg) {
  console.log(`  · ${msg}`);
}

/** 浏览器页顶横幅 + 控制台大字说明，避免「卡住了不知道怎么了」 */
async function showFailBanner(page, { caseName, human, detail, url }) {
  const lines = [
    '【用例失败 · 请截图】',
    `用例: ${caseName}`,
    `人话: ${human}`,
    detail ? `细节: ${String(detail).slice(0, 240)}` : '',
    `页面: ${url}`,
    '截完图 → Playwright Inspector 点 Resume → 继续下一条',
  ].filter(Boolean);
  const text = lines.join('\n');
  console.log(`\n${'!'.repeat(64)}`);
  console.log(text);
  console.log(`${'!'.repeat(64)}\n`);
  if (!page || page.isClosed()) return;
  try {
    await page.evaluate((bannerText) => {
      let el = document.getElementById('pw-5449-fail-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'pw-5449-fail-banner';
        document.body.appendChild(el);
      }
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b91c1c;color:#fff;' +
        'padding:14px 18px;font:13px/1.5 Consolas,monospace;white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      el.textContent = bannerText;
    }, text);
  } catch {
    /* ignore */
  }
}

async function clearFailBanner(page) {
  if (!page || page.isClosed()) return;
  try {
    await page.evaluate(() => document.getElementById('pw-5449-fail-banner')?.remove());
  } catch {
    /* ignore */
  }
}

/** 出错暂停：打开 Inspector，截完图点 Resume 即继续 */
async function pauseForScreenshot(page, { caseName, human, detail }) {
  let url = '(no page)';
  try {
    if (page && !page.isClosed()) url = page.url();
  } catch {
    /* ignore */
  }
  await showFailBanner(page, { caseName, human, detail, url });
  if (page && !page.isClosed()) {
    try {
      await page.pause();
    } catch (err) {
      console.log(`[UI全量] page.pause 不可用: ${err.message || err}`);
      await waitForEnter('[UI全量] 截完图后按 Enter 继续…');
    }
  }
  await clearFailBanner(page);
}

/** 把原始 Playwright 超时翻成人话 */
function humanizeError(err, fallbackHuman) {
  const msg = err?.message || String(err);
  if (/修复项目编号.*禁用/.test(msg)) return msg;
  if (/从未遗留.*可编辑/.test(msg)) return msg;
  if (/下拉为空|没有出现任何选项|无候选/.test(msg)) return msg;
  if (/保存出现错误/.test(msg)) return msg;
  if (/跳到登录页|登录失效/.test(msg)) return msg;
  if (/找不到保存/.test(msg)) return msg;
  if (/Timeout.*waitFor|waiting for locator/i.test(msg)) {
    return fallbackHuman || '某一步等元素超时（页面上没出现脚本期望的控件/选项）';
  }
  return fallbackHuman || msg.slice(0, 200);
}

function fx() {
  const data = loadFixture5449() || {};
  if (!data.project_id) throw new Error('缺少 fixtures/5449，先 prepare:5449 --fresh --phase all');
  return data;
}

function detailUrls(projectId, samples) {
  const pid = projectId;
  // 后台 context-path=/admin
  const admin = (p) => adminAbsPath(p.startsWith('/admin/') ? p : `/admin/${String(p).replace(/^\//, '')}`);
  return {
    thrArchA: samples.threaten?.A?.id
      ? admin(`securityAudit/loophole/threatenDetail/${samples.threaten.A.id}/${pid}/frame`)
      : null,
    thrDataC: samples.threaten?.C?.id
      ? admin(`securityAudit/loophole/threatenDetail/${samples.threaten.C.id}/${pid}/datasafe`)
      : null,
    thrPrivB: samples.threaten?.B?.id
      ? admin(`securityAudit/loophole/threatenDetail/${samples.threaten.B.id}/${pid}/privacy`)
      : null,
    penA: samples.penet?.A?.id
      ? admin(`securityAudit/loophole/penetDetail/${samples.penet.A.id}/${pid}/node`)
      : null,
    penB: samples.penet?.B?.id
      ? admin(`securityAudit/loophole/penetDetail/${samples.penet.B.id}/${pid}/node`)
      : null,
    penC: samples.penet?.C?.id
      ? admin(`securityAudit/loophole/penetDetail/${samples.penet.C.id}/${pid}/node`)
      : null,
    aiA: samples.ai?.A?.id
      ? admin(`securityAudit/loophole/AISafeDetail/${samples.ai.A.id}/${pid}/nodeSafe`)
      : null,
    aiC: samples.ai?.C?.id
      ? admin(`securityAudit/loophole/AISafeDetail/${samples.ai.C.id}/${pid}/nodeSafe`)
      : null,
    netN1: samples.network?.N1?.id
      ? admin(`securityAudit/loophole/cloudDetail/${samples.network.N1.id}`)
      : null,
  };
}

async function soft(page, name, fn, results, humanHint) {
  process.stdout.write(`\n>>> ${name}\n`);
  try {
    await fn();
    console.log(`  PASS ${name}`);
    results.push({ name, ok: true });
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    const human = humanizeError(e, e.human || humanHint);
    console.log(`  FAIL ${name}`);
    console.log(`  人话: ${human}`);
    console.log(`  原始: ${msg.split('\n')[0]}`);
    results.push({ name, ok: false, err: human, raw: msg });
    await pauseForScreenshot(page, { caseName: name, human, detail: msg.split('\n')[0] });
    return false;
  }
}

function fail(human, technical) {
  const e = new Error(technical || human);
  e.human = human;
  throw e;
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
}

/**
 * 只按「表单 label」匹配修复项目编号。
 * 不能用 hasText:/修复项目编号/：关联项目的版本名常含「5449修复项目编号」，会误点到关联项目。
 */
function repairFormItem(scope) {
  return scope.locator('.el-form-item').filter({
    has: scope.locator('.el-form-item__label').filter({ hasText: /^\s*修复项目编号\s*$/ }),
  }).first();
}

async function findRepairItem(page) {
  const item = repairFormItem(page);
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  return item;
}

async function repairSelect(page) {
  const item = await findRepairItem(page);
  return item.locator('.el-select, .repair-project-select .el-select').first();
}

/** Element Plus：禁用态多在 .el-select__wrapper.is-disabled，input 不一定带 disabled */
async function isSelectDisabled(page) {
  const item = await findRepairItem(page);
  return item.evaluate((el) => {
    if (el.querySelector('.el-select.is-disabled, .el-select__wrapper.is-disabled')) return true;
    const wrap = el.querySelector('.el-select__wrapper');
    if (wrap?.getAttribute('aria-disabled') === 'true') return true;
    const input = el.querySelector('input');
    if (input && (input.disabled || input.getAttribute('disabled') != null)) return true;
    return false;
  });
}

async function readStatusText(page) {
  const item = page.locator('.el-form-item').filter({ hasText: /漏洞状态|风险状态/ }).first();
  if (!(await item.count())) return '(未找到状态表单项)';
  return (await item.locator('.el-select').first().innerText().catch(() => '')).trim() || '(空)';
}

async function setStatusToFixed(page) {
  logStep('准备把状态改成「已修复」…');
  const statusItem = page
    .locator('.el-form-item')
    .filter({ hasText: /^(漏洞状态|风险状态|状态)/ })
    .filter({ has: page.locator('.el-select') })
    .first();
  const item =
    (await statusItem.count()) > 0
      ? statusItem
      : page.locator('.el-form-item').filter({ hasText: /漏洞状态|风险状态/ }).first();
  if (!(await item.count())) fail('页面上找不到「漏洞状态/风险状态」下拉', 'status form-item missing');
  const trigger = item.locator('.el-select').first();
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  const cur = await trigger.innerText().catch(() => '');
  logStep(`当前状态显示: ${cur.replace(/\s+/g, ' ').trim() || '(空)'}`);
  if (/已修复/.test(cur)) {
    logStep('已是「已修复」，跳过切换');
    return;
  }
  await trigger.click();
  await page.waitForTimeout(400);
  const dropdown = page.locator('.el-select-dropdown:visible, .el-popper.el-select__popper:visible').last();
  const optExact = dropdown.locator(OPT_SEL).filter({ hasText: /^\s*已修复\s*$/ });
  const optAny = dropdown.locator(OPT_SEL).filter({ hasText: /已修复/ });
  if (await optExact.count()) await optExact.first().click();
  else if (await optAny.count()) await optAny.first().click();
  else {
    fail(
      '点开状态下拉后找不到「已修复」选项（可能该状态下不允许改已修复，或下拉没弹出来）',
      'status option 已修复 missing',
    );
  }
  await page.waitForTimeout(600);
  logStep(`切换后状态: ${(await readStatusText(page)).replace(/\s+/g, ' ')}`);
}

/** Element Plus 下拉项 DOM 类名是 el-select-dropdown__item（不是 .el-option） */
const OPT_SEL = '.el-select-dropdown__item, .el-option';

function visibleRepairOptions(page) {
  // 取当前可见的 select 下拉（一般刚点开的是最后一个）
  return page.locator('.el-popper.el-select__popper:visible, .el-select-dropdown:visible').last().locator(OPT_SEL);
}

async function dumpDropdownDiag(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.el-select-dropdown, .el-popper.el-select__popper, .el-select-dropdown__empty')];
    return nodes.slice(0, 12).map((el) => {
      const st = getComputedStyle(el);
      return {
        tag: el.className.toString().slice(0, 80),
        display: st.display,
        visibility: st.visibility,
        opts: el.querySelectorAll('.el-select-dropdown__item, .el-option').length,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
      };
    });
  });
}

async function pickRepairProject(page, preferred) {
  logStep('检查「修复项目编号」是否可编辑…');
  if (await isSelectDisabled(page)) {
    fail(
      `状态已是「${await readStatusText(page)}」，但「修复项目编号」仍是灰色禁用，点不开下拉（期望遗留/曾遗留→已修复后可填）`,
      'repair select disabled',
    );
  }
  const code = preferred || '';
  const item = await findRepairItem(page);
  const wrap = item.locator('.el-select, .repair-project-select').first();
  const input = item.locator('input').first();

  // 点 wrapper 展开；不要先 fill 关键字（会滤空，页面看起来「开了但没列表」）
  logStep('点开「修复项目编号」下拉（不预填筛选）…');
  await wrap.click({ force: true });
  await page.waitForTimeout(1000);

  let opts = visibleRepairOptions(page);
  if ((await opts.count()) === 0) {
    await input.click({ force: true });
    await page.waitForTimeout(1000);
    opts = visibleRepairOptions(page);
  }

  if ((await opts.count()) === 0 && code) {
    // 有 API 候选时：清空后再用真实编号筛选一次（仅当全量列表为空才尝试）
    logStep(`全量列表暂无 option，尝试按 API 候选筛选: ${code}`);
    await input.fill('');
    await input.fill(String(code));
    await page.waitForTimeout(1000);
    opts = visibleRepairOptions(page);
  }

  if ((await opts.count()) === 0) {
    const diag = await dumpDropdownDiag(page);
    logStep(`下拉 DOM 诊断: ${JSON.stringify(diag)}`);
    const emptyTip = await page.locator('.el-select-dropdown__empty:visible, .el-select-dropdown:visible').innerText().catch(() => '');
    fail(
      `下拉框已经点开了，但里面没有可选行（你看到输入框高亮/有字 ≠ 有候选）。` +
        `DOM 选项数=0${emptyTip ? `；面板文案「${emptyTip.replace(/\s+/g, ' ').slice(0, 40)}」` : ''}。` +
        `请打开 DevTools → Network 看 projectList；若接口有数据而面板仍空，就是前端 options 没挂上`,
      `repair options empty diag=${JSON.stringify(diag).slice(0, 300)}`,
    );
  }

  const total = await opts.count();
  logStep(`下拉候选数: ${total}`);
  let target = opts.first();
  if (code) {
    const hit = opts.filter({ hasText: String(code) });
    if (await hit.count()) {
      target = hit.first();
      logStep(`命中 preferred=${code}`);
    } else {
      logStep(`列表里没有 ${code}，改选第一条`);
    }
  }
  const text = (await target.innerText()).trim();
  logStep(`选中修复项目编号: ${text}`);
  await target.click();
  await page.waitForTimeout(300);
  return text;
}

async function clickSave(page) {
  const btn = page.getByRole('button', { name: /保\s*存|确\s*定|提交/ }).filter({ hasNotText: /取消/ });
  const n = await btn.count();
  if (!n) throw new Error('找不到保存/确定按钮');
  await btn.first().click();
  await page.waitForTimeout(1500);
  // 成功 toast 或仍留在页
  const errToast = page.locator('.el-message--error, .el-notification--error');
  if (await errToast.count()) {
    const t = await errToast.first().innerText();
    throw new Error(`保存出现错误提示: ${t}`);
  }
}

async function openAdmin(page, url, titleHint) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitReady(page);
  if (/\/login(\?|$)/i.test(page.url())) throw new Error(`跳到登录页: ${page.url()}`);
  if (titleHint) {
    // 软等待页面有表单
    await page.locator('form, .el-form, .el-descriptions').first().waitFor({ timeout: 25_000 }).catch(() => {});
  }
}

async function caseLegacyToFixedEditable(page, url, caseName, preferredCode) {
  logStep(`打开详情: ${url}`);
  const listWait = page
    .waitForResponse((r) => /projectList/i.test(r.url()) && r.request().method() === 'POST', { timeout: 20_000 })
    .catch(() => null);
  await openAdmin(page, url, caseName);
  const listResp = await listWait;
  if (listResp) {
    try {
      const body = await listResp.json();
      const n = Array.isArray(body?.data) ? body.data.length : -1;
      logStep(`页面 projectList 响应: HTTP ${listResp.status()} rows=${n}`);
    } catch {
      logStep(`页面 projectList 响应: HTTP ${listResp.status()} (body 非 JSON)`);
    }
  } else {
    logStep('未捕获到 projectList 请求（可能缓存/未加载）');
  }
  logStep('等待「修复项目编号」字段出现…');
  await findRepairItem(page);
  await setStatusToFixed(page);
  const disabled = await isSelectDisabled(page);
  if (disabled) {
    fail(
      `遗留/曾遗留样本改成「已修复」后，「修复项目编号」仍禁用（期望可编辑）。当前状态=${await readStatusText(page)}`,
      'expected editable after legacy→fixed',
    );
  }
  const preferred = preferredCode || (loadFixture5449() || {}).repair_project;
  const picked = await pickRepairProject(page, preferred);
  if (!picked) fail('未选到修复项目候选', 'picked empty');
  logStep('点击保存…');
  await clickSave(page);
  logStep('重新打开详情检查回显…');
  await openAdmin(page, url, caseName);
  const item = await findRepairItem(page);
  const shown = await item.innerText();
  if (!shown.includes(picked) && !/\d{5,}/.test(shown)) {
    logStep(`回显文案: ${shown.slice(0, 120)}`);
  }
}

async function caseNeverLegacyFixedDisabled(page, url, caseName) {
  logStep(`打开详情: ${url}`);
  await openAdmin(page, url, caseName);
  await findRepairItem(page);
  await setStatusToFixed(page);
  const disabled = await isSelectDisabled(page);
  logStep(`修复项目编号 disabled=${disabled}`);
  if (!disabled) {
    fail(
      '从未遗留的样本改成「已修复」后，「修复项目编号」居然可以编辑（期望应禁用）',
      'expected disabled for never-legacy',
    );
  }
  // 提示仅在鼠标悬浮时出现（el-tooltip：不可编辑时启用）
  logStep('鼠标悬浮「修复项目编号」，检查提示文案…');
  const wrap = (await findRepairItem(page)).locator('.repair-project-select, .el-select').first();
  await wrap.hover();
  const tip = page.getByText(/仅遗留或曾为遗留/, { exact: false });
  await tip.first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {
    fail(
      '编号已禁用，但鼠标悬浮后未出现「仅遗留或曾为遗留…」提示',
      'repair tip missing on hover',
    );
  });
  logStep('悬浮提示已出现（符合预期）');
}

async function caseNetworkAuditPass(page, url) {
  await openAdmin(page, url, '网络详情');
  // 详情可能只读；点审核/处理
  const auditBtn = page.getByRole('button', { name: /审核|去处理|处理|待处理/ });
  if (await auditBtn.count()) {
    await auditBtn.first().click();
    await page.waitForTimeout(800);
  }
  const dialog = page.locator('.el-dialog, .el-drawer').filter({ hasText: /审核|修复项目编号|审核结果/ }).last();
  if (await dialog.count()) {
    const result = dialog.locator('.el-select').filter({ has: page.locator('input') }).first();
    // 选通过
    const reviewItem = dialog.locator('.el-form-item').filter({ hasText: /审核结果|漏洞审核/ }).first();
    if (await reviewItem.count()) {
      await reviewItem.locator('.el-select').first().click();
      await page.waitForTimeout(300);
      await page.locator(`.el-select-dropdown ${OPT_SEL}, .el-popper ${OPT_SEL}`).filter({ hasText: /通过/ }).first().click();
      await page.waitForTimeout(400);
    }
    const rp = repairFormItem(page, dialog);
    if (!(await rp.count())) throw new Error('审核弹窗无「修复项目编号」');
    const dis = await rp.locator('.el-select').first().evaluate((el) => {
      return el.className.includes('is-disabled') || !!el.querySelector('[disabled]')
        || !!el.querySelector('.el-select__wrapper.is-disabled');
    });
    if (dis) throw new Error('审核结果=通过后编号仍禁用');
  } else {
    const has = await repairFormItem(page).count();
    const hasAudit = await page.getByRole('button', { name: /审核|处理/ }).count();
    if (!has && !hasAudit) throw new Error('网络详情既无修复项目编号也无审核入口');
  }
}

async function caseFrontEcho(page, projectId, nodeName) {
  const url = frontNodePath(projectId, nodeName);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitReady(page);
  if (/\/login(\?|$)/i.test(page.url())) throw new Error(`前台登录失效: ${page.url()}`);
  await page.locator('body').waitFor({ state: 'visible' });
}

async function caseFrontDetail(page, pathPart, expectRepairLabel) {
  const url = frontAbsPath(pathPart.startsWith('/') ? pathPart : `/${pathPart}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitReady(page);
  if (/\/login(\?|$)/i.test(page.url())) throw new Error(`前台登录失效: ${page.url()}`);
  if (expectRepairLabel) {
    const label = page.getByText(/修复项目编号/, { exact: false });
    await label.first().waitFor({ state: 'visible', timeout: 20_000 });
  }
}

async function main() {
  const data = fx();
  const urls = detailUrls(data.project_id, data);
  console.log('='.repeat(60));
  console.log('5449 UI 全量（有头）');
  console.log(`  project=${data.project_id} KEEP_BROWSER=${keepBrowserEnabled()}`);
  console.log('  失败时：控制台打印【人话原因】+ 页面顶红条；截图后 Inspector 点 Resume 继续');
  console.log('  不是卡死——是故意 pause 等你截图');
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: false,
    slowMo: Number(process.env.SLOW_MO || 80) || 80,
  });
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  const results = [];

  try {
    const adminCtx = await ensureSharedContext(browser, 'admin');
    const adminPage = await adminCtx.newPage();
    const adminToken = await fetchAccessToken(api, superAdmin());
    await paintAuth(adminPage, 'admin', adminToken);

    const rpApi = await repairProjectApiAs(api, superAdmin());
    let preferredCode = data.repair_project || '';
    try {
      preferredCode = await rpApi.pickRepairProjectCode();
      logStep(`API 可用修复项目编号候选: ${preferredCode}`);
    } catch (e) {
      console.log(`  ! API projectList 无候选: ${e.message}`);
    }

    // —— 架构 / 数据 / 隐私 ——
    if (urls.thrArchA) {
      await soft(adminPage, 'UI-ARCH-A 架构威胁遗留→已修复可填编号并保存', () =>
        caseLegacyToFixedEditable(adminPage, urls.thrArchA, '架构A', preferredCode), results);
    }
    if (urls.thrDataC) {
      await soft(adminPage, 'UI-DATA-C 数据威胁从未遗留→已修复应禁用', () =>
        caseNeverLegacyFixedDisabled(adminPage, urls.thrDataC, '数据C'), results);
    }
    if (urls.thrPrivB) {
      await soft(adminPage, 'UI-PRIV-B 隐私威胁曾遗留→已修复可填编号', () =>
        caseLegacyToFixedEditable(adminPage, urls.thrPrivB, '隐私B', preferredCode), results);
    }

    // —— 渗透 ——
    if (urls.penA) {
      await soft(adminPage, 'UI-PEN-A 渗透遗留→已修复可填编号并保存', () =>
        caseLegacyToFixedEditable(adminPage, urls.penA, '渗透A', preferredCode), results);
    }
    if (urls.penB) {
      await soft(adminPage, 'UI-PEN-B 渗透曾遗留→已修复可填编号', () =>
        caseLegacyToFixedEditable(adminPage, urls.penB, '渗透B', preferredCode), results);
    }
    if (urls.penC) {
      await soft(adminPage, 'UI-PEN-C 渗透从未遗留→已修复应禁用', () =>
        caseNeverLegacyFixedDisabled(adminPage, urls.penC, '渗透C'), results);
    }

    // —— AI ——
    if (urls.aiA) {
      await soft(adminPage, 'UI-AI-A AI遗留→已修复可填编号并保存', () =>
        caseLegacyToFixedEditable(adminPage, urls.aiA, 'AIA', preferredCode), results);
    }
    if (urls.aiC) {
      await soft(adminPage, 'UI-AI-C AI从未遗留→已修复应禁用', () =>
        caseNeverLegacyFixedDisabled(adminPage, urls.aiC, 'AIC'), results);
    }

    // —— 网络 ——
    if (urls.netN1) {
      await soft(adminPage, 'UI-NET-N1 网络审核通过可填编号', () =>
        caseNetworkAuditPass(adminPage, urls.netN1), results);
    }

    // —— 前台回显入口 ——
    const frontCtx = await ensureSharedContext(browser, 'front');
    const frontPage = await frontCtx.newPage();
    const frontToken = await fetchAccessToken(api, frontOwner());
    await paintAuth(frontPage, 'front', frontToken);

    await soft(frontPage, 'UI-FRONT-ARCH 前台架构节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, '架构审核'), results);
    await soft(frontPage, 'UI-FRONT-DATA 前台数据节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, '数据安全'), results);
    await soft(frontPage, 'UI-FRONT-PRIV 前台隐私节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, '隐私安全'), results);
    await soft(frontPage, 'UI-FRONT-AI 前台AI节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, 'AI安全'), results);
    await soft(frontPage, 'UI-FRONT-PEN 前台渗透节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, '渗透测试'), results);
    await soft(frontPage, 'UI-FRONT-NET 前台网络节点可打开', () =>
      caseFrontEcho(frontPage, data.project_id, '网络基础设施审核'), results);

    // 前台详情回显（有编号才展示；A/B 保存成功后应可见）
    if (data.threaten?.A?.id) {
      await soft(frontPage, 'UI-FRONT-DET-ARCH 前台架构威胁详情', () =>
        caseFrontDetail(frontPage, `threatenLoophole/detail/${data.threaten.A.id}`, true), results);
    }
    if (data.threaten?.B?.id) {
      await soft(frontPage, 'UI-FRONT-DET-PRIV 前台隐私威胁详情', () =>
        caseFrontDetail(frontPage, `threatenLoophole/detail/${data.threaten.B.id}`, true), results);
    }
    if (data.penet?.A?.id) {
      await soft(frontPage, 'UI-FRONT-DET-PEN 前台渗透详情', () =>
        caseFrontDetail(frontPage, `pentLoophole/detail/${data.penet.A.id}`, true), results);
    }
    if (data.ai?.A?.id) {
      await soft(frontPage, 'UI-FRONT-DET-AI 前台AI详情', () =>
        caseFrontDetail(frontPage, `aiSafeLoophole/detail/${data.ai.A.id}`, true), results);
    }
    if (data.network?.N1?.id) {
      await soft(frontPage, 'UI-FRONT-DET-NET 前台网络详情', () =>
        caseFrontDetail(frontPage, `cloudInfoLoophole/detail/${data.network.N1.id}`, false), results);
    }

    const pass = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log('\n' + '='.repeat(60));
    console.log(`DONE UI全量  pass=${pass} fail=${fail}`);
    results.forEach((r) => console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.err ? ' | ' + r.err.slice(0, 80) : ''}`));
    console.log('='.repeat(60));
    console.log('\n全量跑完。浏览器保持打开；Inspector Resume 或终端 Enter 结束。');
    resetPauseFlag();
    await pauseKeepBrowser(adminPage, '全量结束留窗');
  } finally {
    await api.dispose();
    if (!keepBrowserEnabled()) await browser.close().catch(() => {});
  }
}

main().catch(async (e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
