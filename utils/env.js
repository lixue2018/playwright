/**
 * 环境：对齐 AT_py config/envs.yaml + url_config.boot_test_env
 *
 * 优先级：FRONT_BASE_URL/ADMIN_BASE_URL 环境变量
 *       → PSRB_TEST_ENV / --env / argv :216
 *       → 本仓库默认 216（联调；yaml 的 default 是 pre）
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');

function env(name, fallback = '') {
  const v = process.env[name];
  return v == null || v === '' ? fallback : v;
}

function parseEnvsYaml(text) {
  const envs = {};
  let defaultName = 'pre';
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '');
    if (!line.trim()) continue;
    const def = line.match(/^default:\s*["']?([^"'\s]+)["']?\s*$/);
    if (def) {
      defaultName = def[1];
      continue;
    }
    if (/^envs:\s*$/.test(line)) continue;
    const key = line.match(/^\s{2}["']?([^"':]+)["']?:\s*$/);
    if (key) {
      current = key[1];
      envs[current] = {};
      continue;
    }
    const kv = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.+?)\s*$/);
    if (kv && current) {
      envs[current][kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
  return { default: defaultName, envs };
}

function loadEnvsYaml() {
  const p = path.join(ROOT, 'config', 'envs.yaml');
  if (!fs.existsSync(p)) return { default: '216', envs: {} };
  return parseEnvsYaml(fs.readFileSync(p, 'utf8'));
}

function envNameFromArgv() {
  for (const arg of process.argv.slice(2)) {
    if (arg === ':216' || arg === ':217' || arg === ':218' || arg === ':pre') {
      return arg.slice(1);
    }
    if (arg === '--env' || arg.startsWith('--env=')) {
      if (arg.startsWith('--env=')) return arg.slice('--env='.length);
    }
  }
  return '';
}

const yaml = loadEnvsYaml();
const TEST_ENV =
  env('PSRB_TEST_ENV') ||
  envNameFromArgv() ||
  (env('FRONT_BASE_URL') ? '' : '216');

const preset = (TEST_ENV && yaml.envs[TEST_ENV]) || yaml.envs['216'] || {};

const FRONT_BASE_URL = env('FRONT_BASE_URL', preset.front || 'http://192.168.50.216:3000');
const ADMIN_BASE_URL = env('ADMIN_BASE_URL', preset.admin || 'http://192.168.50.216');
const API_BASE_URL = env('API_BASE_URL', `${ADMIN_BASE_URL.replace(/\/$/, '')}/api`);
const ADMIN_LOGIN_PATH = env('ADMIN_LOGIN_PATH', preset.login_path || '/admin/login?redirect=/index');
const CLIENT_ID = env('PSRB_CLIENT_ID', 'yBQF1Ayq0G8HtG3193wOjapfEaOQgng6');
const AUTH_DIR = path.join(ROOT, '.auth');

const FIXTURE_PATH = path.resolve(
  ROOT,
  env('FIXTURE_PATH', path.join('fixtures', '4834', 'fixture_projects.json')),
);

const FIXTURE_4869_PATH = path.resolve(
  ROOT,
  env('FIXTURE_4869_PATH', path.join('fixtures', '4869', 'fixture_projects.json')),
);

const FIXTURE_5449_PATH = path.resolve(
  ROOT,
  env('FIXTURE_5449_PATH', path.join('fixtures', '5449', 'fixture_projects.json')),
);

function loadFixture() {
  const candidates = [
    FIXTURE_PATH,
    path.join(ROOT, 'fixtures', '4834', 'fixture_projects.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  return null;
}

function fixtureWritePath() {
  if (fs.existsSync(path.dirname(FIXTURE_PATH))) return FIXTURE_PATH;
  return path.join(ROOT, 'fixtures', '4834', 'fixture_projects.json');
}

function patchFixture(key, patch) {
  const target = fixtureWritePath();
  const data = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  data[key] = { ...(data[key] || {}), ...patch };
  data.updated_at = new Date().toISOString().slice(0, 19);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  return target;
}

function saveFixture(data) {
  const target = fixtureWritePath();
  const out = { ...data, updated_at: new Date().toISOString().slice(0, 19) };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
  const mirror = path.join(ROOT, 'fixtures', '4834', 'fixture_projects.json');
  if (path.resolve(mirror) !== path.resolve(target)) {
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.writeFileSync(mirror, JSON.stringify(out, null, 2), 'utf8');
  }
  return target;
}

function saveFixture4869(data) {
  const target = fs.existsSync(path.dirname(FIXTURE_4869_PATH))
    ? FIXTURE_4869_PATH
    : path.join(ROOT, 'fixtures', '4869', 'fixture_projects.json');
  const out = { ...data, updated_at: new Date().toISOString().slice(0, 19) };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
  const mirror = path.join(ROOT, 'fixtures', '4869', 'fixture_projects.json');
  if (path.resolve(mirror) !== path.resolve(target)) {
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.writeFileSync(mirror, JSON.stringify(out, null, 2), 'utf8');
  }
  return target;
}

function loadFixture4869() {
  const candidates = [
    FIXTURE_4869_PATH,
    path.join(ROOT, 'fixtures', '4869', 'fixture_projects.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function loadFixture5449() {
  const candidates = [
    FIXTURE_5449_PATH,
    path.join(ROOT, 'fixtures', '5449', 'fixture_projects.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function saveFixture5449(data) {
  const target = fs.existsSync(path.dirname(FIXTURE_5449_PATH))
    ? FIXTURE_5449_PATH
    : path.join(ROOT, 'fixtures', '5449', 'fixture_projects.json');
  const out = { ...data, updated_at: new Date().toISOString().slice(0, 19) };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
  return target;
}

const NODE_URL_KEY = {
  基本信息: 'basic',
  架构审核: 'frame',
  数据安全: 'datasafe',
  隐私安全: 'privacy',
  源代码安全: 'white',
  开源组件安全: 'osc',
  基线安全: 'app',
  渗透测试: 'black',
  AI安全: 'ai',
  网络基础设施审核: 'scans',
  终审: 'final',
  项目终审: 'final',
};

function nodeKey(nodeNameOrKey) {
  return NODE_URL_KEY[nodeNameOrKey] || String(nodeNameOrKey).replace(/^\//, '');
}

function joinBase(base, pathPart) {
  const b = String(base || '').replace(/\/$/, '');
  const p = String(pathPart || '');
  if (/^https?:\/\//i.test(p)) return p;
  return `${b}${p.startsWith('/') ? p : `/${p}`}`;
}

/** 绝对路径，便于同一 BrowserContext 多标签切换前后台（不必依赖 context.baseURL） */
function frontNodePath(projectId, nodeNameOrKey) {
  return joinBase(FRONT_BASE_URL, `/project/projectLocation/${nodeKey(nodeNameOrKey)}/${projectId}`);
}

function adminNodePath(projectId, nodeNameOrKey) {
  return joinBase(ADMIN_BASE_URL, `/admin/securityAudit/projectLocation/${nodeKey(nodeNameOrKey)}/${projectId}`);
}

function mailReminderListPath() {
  return joinBase(ADMIN_BASE_URL, '/admin/system/mailReminder');
}

function sendRecordPath() {
  return joinBase(ADMIN_BASE_URL, '/admin/system/sendRecord');
}

function adminAbsPath(pathPart) {
  return joinBase(ADMIN_BASE_URL, pathPart);
}

function frontAbsPath(pathPart) {
  return joinBase(FRONT_BASE_URL, pathPart);
}

module.exports = {
  ROOT,
  env,
  TEST_ENV,
  FRONT_BASE_URL,
  ADMIN_BASE_URL,
  API_BASE_URL,
  ADMIN_LOGIN_PATH,
  CLIENT_ID,
  AUTH_DIR,
  FIXTURE_PATH,
  FIXTURE_4869_PATH,
  FIXTURE_5449_PATH,
  loadFixture,
  patchFixture,
  saveFixture,
  fixtureWritePath,
  loadFixture4869,
  saveFixture4869,
  loadFixture5449,
  saveFixture5449,
  NODE_URL_KEY,
  frontNodePath,
  adminNodePath,
  mailReminderListPath,
  sendRecordPath,
  adminAbsPath,
  frontAbsPath,
  joinBase,
};
