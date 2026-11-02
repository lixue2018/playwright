/**
 * 对齐 AT_py cases/4834/data/accounts.py
 * 优先级：环境变量 > fixture.accounts > 默认值
 */
const { env, loadFixture } = require('./env');

const DEFAULT_ACCOUNTS = {
  super_admin: 'jicq1',
  mail_reminder_manager: 'jicq1',
  front_owner: 'fengtt1',
  other_project_owner: 'shaoyp3',
  no_interface_user: 'tianmq1',
  no_email_owner: '',
  node_auditors: {
    基本信息: { auditor: 'qiangsy1', backup: 'chiyn2' },
    架构审核: { auditor: 'qidi1', backup: 'houwei6' },
    数据安全: { auditor: 'fengxq4', backup: 'qidi1' },
    隐私安全: { auditor: 'zhanglw11', backup: 'fengxq4' },
    源代码安全: { auditor: 'jiangjz4', backup: 'sunha1' },
    开源组件安全: { auditor: 'guobing8', backup: 'renjx5' },
    基线安全: { auditor: 'shaoyp3', backup: 'houzx2' },
    渗透测试: { auditor: 'yujf7', backup: 'wangye12' },
    '渗透-服务端': { auditor: 'libin41', backup: 'renjx5' },
    '渗透-二进制': { auditor: 'wangye12', backup: 'wangye12' },
    '渗透-移动端': { auditor: 'lvll2', backup: 'zhangyj75' },
    AI安全: { auditor: 'lity22', backup: 'liuyh67' },
    网络基础设施审核: { auditor: 'liuxu25', backup: 'guozj8' },
    终审: { auditor: 'qiangsy1', backup: 'chiyn2' },
  },
};

const ENV_KEYS = {
  super_admin: 'PSRB_ACCT_SUPER_ADMIN',
  mail_reminder_manager: 'PSRB_ACCT_MAIL_MANAGER',
  front_owner: 'PSRB_ACCT_FRONT_OWNER',
  other_project_owner: 'PSRB_ACCT_OTHER_OWNER',
  no_interface_user: 'PSRB_ACCT_NO_INTERFACE',
};

const LOC_NODE_NAME = {
  1: '基本信息',
  2: '架构审核',
  23: '数据安全',
  3: '隐私安全',
  5: '源代码安全',
  6: '开源组件安全',
  8: '基线安全',
  7: '渗透测试',
  11: 'AI安全',
  40: '网络基础设施审核',
  10: '终审',
};

function mergeAccounts() {
  const out = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
  const fx = loadFixture();
  const acc = fx && fx.accounts && typeof fx.accounts === 'object' ? fx.accounts : {};
  for (const [k, v] of Object.entries(acc)) {
    if (v == null || v === '') continue;
    if (k === 'node_auditors' && typeof v === 'object') {
      out.node_auditors = { ...out.node_auditors, ...v };
    } else {
      out[k] = v;
    }
  }
  for (const [logical, envKey] of Object.entries(ENV_KEYS)) {
    const envV = env(envKey);
    if (envV) out[logical] = envV;
  }
  const frontUser = env('PSRB_FRONT_USER');
  if (frontUser) out.front_owner = frontUser;
  return out;
}

function acct(key, fallback = '') {
  return String(mergeAccounts()[key] || fallback).trim();
}

function superAdmin() {
  return acct('super_admin', 'jicq1');
}

function frontOwner() {
  return acct('front_owner', 'fengtt1');
}

function noInterfaceUser() {
  return acct('no_interface_user', 'tianmq1');
}

function otherProjectOwner() {
  return acct('other_project_owner', 'shaoyp3');
}

function nodePair(nodeName) {
  const row = (mergeAccounts().node_auditors || {})[nodeName] || {};
  return [String(row.auditor || '').trim(), String(row.backup || '').trim()];
}

function nodePairByLocation(location) {
  const name = LOC_NODE_NAME[Number(location)] || '';
  return name ? nodePair(name) : ['', ''];
}

function auditorForLocation(location, { preferBackup = false } = {}) {
  const [a, b] = nodePairByLocation(location);
  if (preferBackup && b) return b;
  return a || b;
}

function foreignAuditor(location) {
  const [selfA, selfB] = nodePairByLocation(location);
  const ban = new Set([selfA, selfB, '']);
  const selfName = LOC_NODE_NAME[Number(location)];
  for (const [name, row] of Object.entries(mergeAccounts().node_auditors || {})) {
    if (name === selfName) continue;
    const cand = String((row || {}).auditor || '').trim();
    if (cand && !ban.has(cand)) return cand;
  }
  return 'qiangsy1';
}

function nodeNameOf(location) {
  return LOC_NODE_NAME[Number(location)] || '';
}

const ACCOUNTS = {
  get superAdmin() {
    return superAdmin();
  },
  get frontOwner() {
    return frontOwner();
  },
  get noInterfaceUser() {
    return noInterfaceUser();
  },
  get otherProjectOwner() {
    return otherProjectOwner();
  },
};

module.exports = {
  mergeAccounts,
  superAdmin,
  frontOwner,
  noInterfaceUser,
  otherProjectOwner,
  nodePair,
  nodePairByLocation,
  auditorForLocation,
  foreignAuditor,
  nodeNameOf,
  LOC_NODE_NAME,
  ACCOUNTS,
};
