/**
 * 全量产品组成（对齐 AT_py/造数/_components.py）。
 * 选件/配件按环境解析；可用 PSRB_OPTION_PART 覆盖。
 */
const { env, TEST_ENV } = require('./env');
const fs = require('fs');
const path = require('path');

const OPTION_PART_BY_ENV = {
  '216': '选件',
  '217': '选件',
  '218': '配件',
  pre: '选件',
};

const BASE_COMPONENT_NAMES = [
  'Web服务（业务面）',
  'Web服务（管理面）',
  'API服务',
  'IOT设备',
  'Windows APP',
  'Android APP',
  'IOS APP',
  '__OPTION_PART__',
  '小程序',
  '公众号',
  'BIOS',
  '整机产品',
  '其他',
  'Linux APP',
  'Windows 驱动',
  'MacOS',
];

/** 勾选时的别名（页面文案可能略有差异） */
const COMPONENT_ALIASES = {
  选件: ['选件', '配件'],
  配件: ['配件', '选件'],
  'Windows 驱动': ['Windows 驱动', 'Windows驱动'],
  整机产品: ['整机产品', '整机'],
  MacOS: ['MacOS', 'macOS', 'Mac OS'],
};

function optionPartFromYaml(envName) {
  try {
    const p = path.join(__dirname, '..', 'config', 'envs.yaml');
    if (!fs.existsSync(p)) return '';
    const text = fs.readFileSync(p, 'utf8');
    let current = '';
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '');
      const key = line.match(/^\s{2}["']?([^"':]+)["']?:\s*$/);
      if (key) {
        current = key[1];
        continue;
      }
      if (current !== envName) continue;
      const kv = line.match(/^\s{4}option_part_name:\s*(.+?)\s*$/);
      if (kv) return kv[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

function resolveOptionPart(envName) {
  const override = (env('PSRB_OPTION_PART') || '').trim();
  if (override === '选件' || override === '配件') return override;
  const key = String(envName || TEST_ENV || 'pre').trim();
  const fromYaml = optionPartFromYaml(key);
  if (fromYaml === '选件' || fromYaml === '配件') return fromYaml;
  return OPTION_PART_BY_ENV[key] || '选件';
}

function allComponentNames(envName) {
  const option = resolveOptionPart(envName);
  return BASE_COMPONENT_NAMES.map((n) => (n === '__OPTION_PART__' ? option : n));
}

function componentCandidates(name) {
  return COMPONENT_ALIASES[name] || [name];
}

module.exports = {
  BASE_COMPONENT_NAMES,
  COMPONENT_ALIASES,
  resolveOptionPart,
  allComponentNames,
  componentCandidates,
};
