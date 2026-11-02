/**
 * 前台材料提交（开源/基线）— Playwright 页上传，文件缺失或 SKIP_FRONT=1 时跳过
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { ROOT, FRONT_BASE_URL, env, AUTH_DIR } = require('../../utils/env');

function resolveFileRoot() {
  const candidates = [
    path.join(ROOT, 'file'),
    path.join(ROOT, '..', 'AT_py', 'file'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function pickFirstFile(dir, exts = ['.zip', '.xlsx', '.xls', '.json', '.apk', '.exe', '.msi']) {
  if (!dir || !fs.existsSync(dir)) return null;
  const walk = (d, depth = 0) => {
    if (depth > 3) return null;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isFile() && exts.some((x) => e.name.toLowerCase().endsWith(x))) return p;
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const hit = walk(p, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(dir);
}

/**
 * @returns {{ok:boolean, skipped?:boolean, report:object}}
 */
async function frontSubmitSeed(projectId, { includeOpensource = true, includeBaseline = true } = {}) {
  if (env('SKIP_FRONT_SEED', '0') === '1' || env('SKIP_FRONT', '0') === '1') {
    return { ok: true, skipped: true, report: { reason: 'SKIP_FRONT' } };
  }
  const fileRoot = resolveFileRoot();
  if (!fileRoot) {
    return { ok: false, skipped: true, report: { reason: 'no_file_root' } };
  }

  const oscFile =
    pickFirstFile(path.join(fileRoot, '开源组件安全')) ||
    pickFirstFile(path.join(fileRoot, '开源'));
  const baseFile =
    pickFirstFile(path.join(fileRoot, '基线安全', 'win app文件')) ||
    pickFirstFile(path.join(fileRoot, '基线安全'));

  const authFile = path.join(AUTH_DIR, 'front-owner.json');
  if (!fs.existsSync(authFile)) {
    return { ok: false, skipped: true, report: { reason: 'no_front_auth', hint: '先跑 auth.setup' } };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: FRONT_BASE_URL,
    storageState: authFile,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const report = { opensource: null, baseline: null };

  try {
    const gotoNode = async (nodePath) => {
      const url = `/projectLocation/${nodePath}/${projectId}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('.el-loading-mask').waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
    };

    if (includeOpensource && oscFile) {
      try {
        await gotoNode('oscLoopholeb');
        const input = page.locator('input[type=file]').first();
        if (await input.count()) {
          await input.setInputFiles(oscFile);
          const submit = page.getByRole('button', { name: /提交|上传|确认/ }).first();
          if (await submit.isVisible().catch(() => false)) await submit.click();
          report.opensource = { ok: true, file: path.basename(oscFile) };
        } else {
          report.opensource = { ok: false, err: 'no_file_input' };
        }
      } catch (e) {
        report.opensource = { ok: false, err: String(e.message || e).slice(0, 120) };
      }
    } else if (includeOpensource) {
      report.opensource = { ok: false, skipped: true, reason: 'no_osc_file' };
    }

    if (includeBaseline && baseFile) {
      try {
        await gotoNode('app');
        const input = page.locator('input[type=file]').first();
        if (await input.count()) {
          await input.setInputFiles(baseFile);
          const submit = page.getByRole('button', { name: /提交|上传|确认/ }).first();
          if (await submit.isVisible().catch(() => false)) await submit.click();
          report.baseline = { ok: true, file: path.basename(baseFile) };
        } else {
          report.baseline = { ok: false, err: 'no_file_input' };
        }
      } catch (e) {
        report.baseline = { ok: false, err: String(e.message || e).slice(0, 120) };
      }
    } else if (includeBaseline) {
      report.baseline = { ok: false, skipped: true, reason: 'no_baseline_file' };
    }
  } catch (e) {
    report.error = String(e.message || e).slice(0, 160);
  }

  const anyOk = !!(report.opensource?.ok || report.baseline?.ok);
  return { ok: anyOk, report };
}

module.exports = { frontSubmitSeed, resolveFileRoot, pickFirstFile };
