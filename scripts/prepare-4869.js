#!/usr/bin/env node
/**
 * 4869 造数（JS）：建项 + 前置审批 + 渗透造洞/改状态。
 *
 * 用法：
 *   node scripts/prepare-4869.js --phase create --only N07,D03,D04 :216
 *   node scripts/prepare-4869.js --phase vuln,status --only N07 :216
 *   node scripts/prepare-4869.js --phase all --only N07 :216
 *   node scripts/prepare-4869.js --phase bind --n07 5003
 *
 * 环境：
 *   PSRB_TEMPLATE_VULN_ID  复制造洞的模板正式漏洞 id
 */
const { request: pwRequest } = require('@playwright/test');
const {
  TEST_ENV,
  API_BASE_URL,
  loadFixture4869,
  saveFixture4869,
  env,
} = require('../utils/env');
const {
  createProjectFromTemplate,
  approveNode,
  accountsForFixture,
} = require('../utils/project-audit-api');
const { NODE_LOCATION } = require('../utils/rules');
const { superAdmin } = require('../utils/accounts');
const {
  loopholebApiAs,
  buildStatusPlan,
  buildVulnCreateSpecs,
  MATRIX_FILL_STATUSES,
} = require('../utils/loopholeb-api');

const SPECS = {
  D03: {
    index: 3,
    note: '停在基本信息待审（无矩阵）',
    approve_before: [],
    target_node: '基本信息',
    need_vuln: false,
  },
  D04: {
    index: 4,
    note: '渗透待审无漏洞（矩阵全0）',
    approve_before: ['基本信息', '架构审核', '数据安全', '隐私安全', '源代码安全'],
    target_node: '渗透测试',
    need_vuln: false,
  },
  N07: {
    index: 17,
    note: '渗透测试待审+本节点多等级/六态漏洞（主路径）',
    approve_before: ['基本信息', '架构审核', '数据安全', '隐私安全', '源代码安全'],
    target_node: '渗透测试',
    need_vuln: true,
    also_write_as: ['D01'],
    vuln_levels: ['高危', '低危', '中危', '提示', '严重'],
    vuln_statuses: [...MATRIX_FILL_STATUSES],
  },
};

function parseArgs(argv) {
  const out = { phase: 'create', only: 'N07,D03,D04', n07: '', d03: '', d04: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--phase') out.phase = argv[++i] || out.phase;
    else if (a.startsWith('--phase=')) out.phase = a.slice('--phase='.length);
    else if (a === '--only') out.only = argv[++i] || out.only;
    else if (a.startsWith('--only=')) out.only = a.slice('--only='.length);
    else if (a === '--n07') out.n07 = argv[++i] || '';
    else if (a.startsWith('--n07=')) out.n07 = a.slice('--n07='.length);
    else if (a === '--d03') out.d03 = argv[++i] || '';
    else if (a.startsWith('--d03=')) out.d03 = a.slice('--d03='.length);
    else if (a === '--d04') out.d04 = argv[++i] || '';
    else if (a.startsWith('--d04=')) out.d04 = a.slice('--d04='.length);
  }
  return out;
}

function resolveKeys(only) {
  const keys = String(only || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const k of keys) {
    if (!SPECS[k]) throw new Error(`unknown key ${k}，可选 ${Object.keys(SPECS)}`);
  }
  return keys.length ? keys : ['N07'];
}

function loadData() {
  return loadFixture4869() || {};
}

function persist(data) {
  data.accounts = accountsForFixture();
  data.test_env = TEST_ENV || '';
  data.api_host = API_BASE_URL;
  data.note = '由 scripts/prepare-4869.js 生成（create + vuln/status API）';
  const p = saveFixture4869(data);
  console.log(`[prepare-4869] fixture → ${p}`);
  return p;
}

function syncAliases(data, key, row) {
  data[key] = row;
  const also = SPECS[key]?.also_write_as || [];
  for (const alias of also) {
    data[alias] = { ...row, key: alias, alias_of: key };
  }
}

async function approveBefore(request, projectId, nodes) {
  const itCode = superAdmin();
  for (const node of nodes) {
    const result = node === '基本信息' ? '审批通过' : '免审';
    console.log(`  审批 ${node} → ${result} (${itCode})`);
    await approveNode(request, projectId, node, {
      approvalResult: result,
      remark: `4869造数-${node}`,
      itCode,
    });
  }
}

async function phaseCreate(request, keys) {
  const data = loadData();
  const prefix = env('PSRB_VERSION_PREFIX', '4869节点审批弹框');
  for (const key of keys) {
    const spec = SPECS[key];
    const version = `${prefix}-js-${Date.now()}-${spec.index}`;
    console.log(`\n===== ${key} create version=${version} target=${spec.target_node} =====`);
    const { projectId, version: ver } = await createProjectFromTemplate(request, { version });
    await approveBefore(request, projectId, spec.approve_before || []);
    const [loc, sa] = NODE_LOCATION[spec.target_node] || [null, 0];
    const row = {
      ...(data[key] || {}),
      key,
      project_id: String(projectId),
      product_version: ver,
      note: spec.note,
      target_node: spec.target_node,
      need_vuln: !!spec.need_vuln,
      location: loc,
      second_audit: sa || 0,
      approve_before: spec.approve_before || [],
      env: TEST_ENV || '',
    };
    syncAliases(data, key, row);
    console.log(`OK ${key} project_id=${projectId}`);
  }
  persist(data);
  return data;
}

async function phaseVuln(request, keys) {
  const data = loadData();
  const api = await loopholebApiAs(request, superAdmin());
  for (const key of keys) {
    const spec = SPECS[key];
    const row = data[key] || {};
    if (!spec.need_vuln) {
      console.log(`skip vuln ${key} need_vuln=False`);
      continue;
    }
    const pid = String(row.project_id || '').trim();
    if (!pid) throw new Error(`${key} 缺 project_id，先 --phase create`);

    const plan = buildStatusPlan({
      levels: spec.vuln_levels,
      statuses: spec.vuln_statuses || MATRIX_FILL_STATUSES,
    });
    const createSpecs = buildVulnCreateSpecs(plan);
    console.log(`\n===== ${key} vuln pid=${pid} count=${createSpecs.length} =====`);
    const res = await api.createVulnsOnProject(pid, createSpecs);
    row.vuln_added = res.created;
    row.vuln_plan = plan.map(([level, status]) => ({ level, status }));
    row.seed_vulns = res.created.map((c) => ({
      name: c.name,
      level: c.level,
      status: c.status,
      vuln_id: c.vuln_id,
      node: spec.target_node,
    }));
    const unfixedPref = ['待评估', '待复测', '待修复'];
    const seedHit =
      res.created.find((c) => c.level === '高危' && unfixedPref.includes(c.status || '')) ||
      res.created.find((c) => unfixedPref.includes(c.status || '')) ||
      res.created.find((c) => c.level === '高危') ||
      res.created[0] ||
      {};
    row.seed_vuln_name = seedHit.name || '';
    syncAliases(data, key, row);
    console.log(`OK ${key} created=${res.created.length} listed=${res.listed} seed=${row.seed_vuln_name}`);
  }
  persist(data);
}

async function phaseStatus(request, keys) {
  const data = loadData();
  const api = await loopholebApiAs(request, superAdmin());
  for (const key of keys) {
    const spec = SPECS[key];
    const row = data[key] || {};
    if (!spec.need_vuln) {
      console.log(`skip status ${key} need_vuln=False`);
      continue;
    }
    const pid = String(row.project_id || '').trim();
    if (!pid) throw new Error(`${key} 缺 project_id`);

    const plan =
      Array.isArray(row.vuln_plan) && row.vuln_plan.length
        ? row.vuln_plan.map((p) => [p.level, p.status])
        : buildStatusPlan({
            levels: spec.vuln_levels,
            statuses: spec.vuln_statuses || MATRIX_FILL_STATUSES,
          });
    console.log(`\n===== ${key} status pid=${pid} targets=${plan.length} =====`);
    const report = await api.applyStatusPlan(pid, plan);
    for (const d of report.detail || []) {
      console.log(
        `  [api] ${d.level || '*'} → ${d.status}: ${d.ok ? 'OK' : 'FAIL'} id=${d.id} ${d.err || ''}`,
      );
    }
    row.status_set = report;
    row.matrix_statuses = spec.vuln_statuses || MATRIX_FILL_STATUSES;
    if (Array.isArray(row.seed_vulns)) {
      for (const seed of row.seed_vulns) {
        const hit = (report.detail || []).find((d) => d.id === seed.vuln_id);
        if (hit?.ok) seed.status = hit.status;
      }
      const unfixedPref = ['待评估', '待复测', '待修复'];
      const seedHit =
        row.seed_vulns.find((s) => s.level === '高危' && unfixedPref.includes(s.status || '')) ||
        row.seed_vulns.find((s) => unfixedPref.includes(s.status || '')) ||
        row.seed_vulns.find((s) => s.level === '高危') ||
        row.seed_vulns[0];
      if (seedHit?.name) row.seed_vuln_name = seedHit.name;
    }
    syncAliases(data, key, row);
    console.log(`OK ${key} status ${report.ok}/${report.total}`);
  }
  persist(data);
}

function phaseBind(args) {
  const data = loadData();
  const mapping = { N07: args.n07, D03: args.d03, D04: args.d04 };
  for (const [key, pid] of Object.entries(mapping)) {
    if (!String(pid || '').trim()) continue;
    const spec = SPECS[key];
    const [loc, sa] = NODE_LOCATION[spec.target_node] || [null, 0];
    const row = {
      ...(data[key] || {}),
      key,
      project_id: String(pid).trim(),
      note: spec.note,
      target_node: spec.target_node,
      need_vuln: !!spec.need_vuln,
      location: loc,
      second_audit: sa || 0,
      reused: true,
    };
    syncAliases(data, key, row);
    console.log(`[prepare-4869] 绑定 ${key}=${pid}`);
  }
  persist(data);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let phases = String(args.phase || 'create')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (phases.includes('all')) phases = ['create', 'vuln', 'status'];
  const keys = resolveKeys(args.only);

  if (phases.includes('bind') || args.n07 || args.d03 || args.d04) {
    phaseBind(args);
  }

  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    if (phases.includes('create')) await phaseCreate(request, keys);
    if (phases.includes('vuln')) await phaseVuln(request, keys);
    if (phases.includes('status')) await phaseStatus(request, keys);
  } finally {
    await request.dispose();
  }
  console.log('DONE prepare-4869', phases, keys, `env=${TEST_ENV || '(default)'}`);
}

main().catch((err) => {
  console.error('FAIL prepare-4869:', err);
  process.exitCode = 1;
});
