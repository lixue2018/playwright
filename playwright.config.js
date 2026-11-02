/**
 * Playwright 工程：setup 产出前后台 storageState；front / admin / logic 分项目。
 *
 * 4834：仅页面冒烟 + logic；已移除 API 用例工程。
 *
 * CASE_SET / CASE_ONLY：
 *   CASE_SET=smoke|logic|all   → 默认 smoke
 *   CASE_ONLY=SMOKE-FP-001
 *   KEEP_BROWSER=1（默认）失败停跑、有头、不关窗等人工复看；=0 则自动关
 */
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
const { FRONT_BASE_URL, ADMIN_BASE_URL, AUTH_DIR } = require('./utils/env');
const { keepBrowserEnabled } = require('./utils/keep-browser');

// npm run test:smoke:headless 时默认关 KEEP_BROWSER / 无头（仍可被环境变量覆盖）
if (process.env.npm_lifecycle_event === 'test:smoke:headless') {
  if (process.env.KEEP_BROWSER == null || process.env.KEEP_BROWSER === '') process.env.KEEP_BROWSER = '0';
  if (process.env.HEADED == null || process.env.HEADED === '') process.env.HEADED = '0';
}

/** 从 CLI --project 推断 CASE_SET（兼容 Windows npm 不能写 CASE_SET=x） */
function inferCaseSetFromArgv() {
  const args = process.argv.slice(2);
  const projects = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--project' && args[i + 1]) {
      projects.push(String(args[i + 1]));
      i += 1;
    } else if (a.startsWith('--project=')) {
      projects.push(a.slice('--project='.length));
    }
  }
  if (!projects.length) return '';
  const set = new Set(projects);
  if (set.has('logic') && !set.has('front') && !set.has('admin')) return 'logic';
  return '';
}

const CASE_SET = String(process.env.CASE_SET || inferCaseSetFromArgv() || 'smoke')
  .toLowerCase()
  .trim();
// 写入 env，避免 worker 重载配置时丢 CLI 推断
process.env.CASE_SET = CASE_SET;
const CASE_ONLY = String(process.env.CASE_ONLY || '').trim();
const KEEP_BROWSER = keepBrowserEnabled();
const HEADED =
  String(process.env.HEADED || '').trim() === '0'
    ? false
    : KEEP_BROWSER || ['1', 'true', 'yes'].includes(String(process.env.HEADED || '').toLowerCase());

/** 每步操作间隔（ms）。默认 0 正常速度；需要跟画面时设 SLOW_MO=350 */
function resolveSlowMo() {
  const raw = process.env.SLOW_MO;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

const SLOW_MO = resolveSlowMo();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildGrep() {
  if (!CASE_ONLY) return undefined;
  const ids = CASE_ONLY.split(/[,;\s]+/).filter(Boolean);
  if (!ids.length) return undefined;
  return new RegExp(ids.map(escapeRegex).join('|'));
}

/** @type {Record<string, string[]>} */
const SET_PROJECTS = {
  smoke: ['setup-auth', 'front-ui-login', 'admin-ui-login', 'front', 'admin', 'api'],
  logic: ['logic'],
  api: ['api'],
  all: ['setup-auth', 'front-ui-login', 'admin-ui-login', 'front', 'admin', 'api', 'logic'],
};

const allowed = new Set(SET_PROJECTS[CASE_SET] || SET_PROJECTS.smoke);

const chromeUse = {
  ...devices['Desktop Chrome'],
  headless: !HEADED,
  // 有头复看时视口跟随窗口；无头仍用 Desktop Chrome 默认尺寸
  // viewport=null 时不能带 deviceScaleFactor（Playwright 会报错）
  ...(HEADED
    ? { viewport: null, deviceScaleFactor: undefined }
    : {}),
  launchOptions: {
    slowMo: SLOW_MO,
  },
};

/** @type {import('@playwright/test').Project[]} */
const allProjects = [
  {
    name: 'setup-auth',
    testMatch: /auth\.setup\.js/,
  },
  {
    name: 'front-ui-login',
    use: { ...chromeUse, baseURL: FRONT_BASE_URL },
    testMatch: /(?:^|[/\\])login\.spec\.js$/,
  },
  {
    name: 'admin-ui-login',
    use: { ...chromeUse, baseURL: ADMIN_BASE_URL },
    testMatch: /(?:^|[/\\])admin-login\.spec\.js$/,
  },
  {
    name: 'front',
    dependencies: ['setup-auth'],
    use: {
      ...chromeUse,
      baseURL: FRONT_BASE_URL,
      storageState: path.join(AUTH_DIR, 'front-owner.json'),
    },
    testMatch: [
      /smoke-(pause-entry|fp-|auth|fr-fc|scheduled)/,
      /5449[/\\]smoke-front/,
    ],
  },
  {
    name: 'admin',
    dependencies: ['setup-auth'],
    use: {
      ...chromeUse,
      baseURL: ADMIN_BASE_URL,
      storageState: path.join(AUTH_DIR, 'super-admin.json'),
    },
    testMatch: [
      /smoke-(cfg|bp|br-bc)/,
      /4869[/\\]smoke-(new|drw|apr|loop|mtx)/,
      /devsecops[/\\]smoke-/,
      /5449[/\\]smoke-admin/,
    ],
  },
  {
    name: 'api',
    use: { ...chromeUse },
    testMatch: [
      /5449[/\\]api[/\\].*\.spec\.js/,
      /4869[/\\]smoke-api-matrix/,
    ],
  },
  {
    name: 'logic',
    use: { ...chromeUse },
    testMatch: [/(4834|devsecops|5449)[/\\]logic[/\\].*\.spec\.js/],
  },
];

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  maxFailures: KEEP_BROWSER ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // 人工 pause 时放宽超时；KEEP_BROWSER=0 用 90s
  timeout: KEEP_BROWSER ? 30 * 60_000 : 90_000,
  expect: { timeout: 15_000 },
  grep: buildGrep(),
  use: {
    ...chromeUse,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    locale: 'zh-CN',
  },
  projects: allProjects.filter((p) => allowed.has(p.name)),
});
