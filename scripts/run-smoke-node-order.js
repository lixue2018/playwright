#!/usr/bin/env node
/**
 * 4834 冒烟：按「单节点闭环」顺序跑，少换审核人。
 * CFG → 暂停入口 → FP → BP → FR → BR → FC → BC → AUTH
 *
 * 注意：尾参 :216 / :pre 只设环境，不传给 playwright（否则会被当成测试文件过滤）。
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const pw = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');

const steps = [
  { project: 'admin', grep: 'SMOKE-CFG' },
  { project: 'front', grep: '申请暂停入口' },
  { project: 'front', grep: 'SMOKE-FP' },
  { project: 'admin', grep: 'SMOKE-BP' },
  { project: 'front', grep: 'SMOKE-FR' },
  { project: 'admin', grep: 'SMOKE-BR' },
  { project: 'front', grep: 'SMOKE-FC' },
  { project: 'admin', grep: 'SMOKE-BC' },
  { project: 'front', grep: 'SMOKE-AUTH' },
];

const ENV_TAIL = new Set([':216', ':217', ':218', ':pre']);
const raw = process.argv.slice(2);
const extra = [];
for (const a of raw) {
  if (ENV_TAIL.has(a)) {
    process.env.PSRB_TEST_ENV = a.slice(1);
    continue;
  }
  if (a === '--env' || a.startsWith('--env=')) {
    const v = a.startsWith('--env=') ? a.slice('--env='.length) : '';
    if (v) process.env.PSRB_TEST_ENV = v;
    continue;
  }
  extra.push(a);
}

for (const step of steps) {
  const args = ['test', `--project=${step.project}`, `--grep=${step.grep}`, ...extra];
  console.log(`\n===== smoke step: ${step.project} / ${step.grep} =====`);
  const r = spawnSync(pw, args, { cwd: root, stdio: 'inherit', shell: true, env: process.env });
  if (r.status) {
    process.exitCode = r.status || 1;
    break;
  }
}

if (!process.exitCode) console.log('\nDONE test:smoke (node-order)');
