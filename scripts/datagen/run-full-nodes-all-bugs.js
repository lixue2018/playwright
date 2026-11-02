#!/usr/bin/env node
/**
 * 全量节点造数（JS）— 对齐 AT_py/造数/run_full_nodes_all_bugs.py
 *
 * 已覆盖（API 优先）：
 *   建项 → 基本信息过审 → 架构/数据/隐私威胁 → 审批到源码
 *   → 开源/基线前台上传（可 SKIP_FRONT）→ 审批开源基线
 *   → 渗透造洞六态 → AI complianceNote → 基建导入+处置
 *
 * 用法：
 *   npm run datagen:full -- :216
 *   npm run datagen:full -- --fresh :216
 *   npm run datagen:full -- --resume --project 5003 --from 渗透测试 :216
 *   SEED_EACH=1 SKIP_FRONT=1 npm run datagen:full -- --fresh :216
 */
const fs = require('fs');
const path = require('path');
const { request: pwRequest } = require('@playwright/test');
const { TEST_ENV, API_BASE_URL, env, ROOT } = require('../../utils/env');
const {
  createProjectFromTemplate,
  approveNode,
  accountsForFixture,
} = require('../../utils/project-audit-api');
const { superAdmin } = require('../../utils/accounts');
const {
  loopholebApiAs,
  buildStatusPlan,
  buildVulnCreateSpecs,
  MATRIX_FILL_STATUSES,
} = require('../../utils/loopholeb-api');
const { threatenApiAs, buildThreatSpecs } = require('../../utils/threaten-api');
const { aiComplianceApiAs, buildAiSpecs } = require('../../utils/ai-compliance-api');
const { cloudInfraApiAs, buildInfraSpecs } = require('../../utils/cloud-infra-api');
const { frontSubmitSeed } = require('../stages/front-submit');

const LOG_DIR = path.join(ROOT, 'logs', 'datagen');
const LAST_PROJECT = path.join(LOG_DIR, 'last_project.json');

const NODE_ORDER = [
  '架构审核',
  '数据安全',
  '隐私安全',
  '源代码安全',
  '开源组件安全',
  '基线安全',
  '渗透测试',
  'AI安全',
  '网络基础设施审核',
];

function seedEach() {
  return Math.max(1, Number(env('SEED_EACH', '1')) || 1);
}

function parseArgs(argv) {
  const out = {
    fresh: false,
    resume: false,
    from: '',
    to: '',
    projectId: env('PROJECT_ID', ''),
    skipFront: env('SKIP_FRONT', '') === '1' || env('SKIP_FRONT_SEED', '') === '1',
    skipExtra: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fresh' || a === '--no-resume') out.fresh = true;
    else if (a === '--resume' || a === '-r') out.resume = true;
    else if (a === '--from' || a === '-f') out.from = argv[++i] || '';
    else if (a.startsWith('--from=')) out.from = a.split('=')[1];
    else if (a === '--to' || a === '-t') out.to = argv[++i] || '';
    else if (a.startsWith('--to=')) out.to = a.split('=')[1];
    else if (a === '--project' || a === '--project-id') out.projectId = argv[++i] || '';
    else if (a.startsWith('--project=')) out.projectId = a.split('=')[1];
    else if (a === '--no-front') out.skipFront = true;
    else if (a === '--front') out.skipFront = false;
    else if (a === '--extra') out.skipExtra = false;
  }
  if (out.fresh) out.resume = false;
  if ((out.from || out.to) && !out.fresh) out.resume = true;
  return out;
}

function loadRecord() {
  try {
    if (fs.existsSync(LAST_PROJECT)) return JSON.parse(fs.readFileSync(LAST_PROJECT, 'utf8'));
  } catch {
    /* ignore */
  }
  return {};
}

function saveRecord(rec) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = {
    ...rec,
    updated_at: new Date().toISOString().slice(0, 19),
    test_env: TEST_ENV || '',
    api_host: API_BASE_URL,
    accounts: accountsForFixture(),
  };
  fs.writeFileSync(LAST_PROJECT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`[datagen] → ${LAST_PROJECT}`);
  return out;
}

function shouldRun(node, from, to) {
  const fi = from ? NODE_ORDER.indexOf(from) : 0;
  const ti = to ? NODE_ORDER.indexOf(to) : NODE_ORDER.length - 1;
  const i = NODE_ORDER.indexOf(node);
  if (i < 0) return true;
  return i >= Math.max(0, fi) && i <= (ti < 0 ? NODE_ORDER.length - 1 : ti);
}

async function approve(request, projectId, nodes) {
  const itCode = superAdmin();
  for (const node of nodes) {
    const result = node === '基本信息' ? '审批通过' : '免审';
    console.log(`  审批 ${node} → ${result}`);
    try {
      await approveNode(request, projectId, node, {
        approvalResult: result,
        remark: `datagen-${node}`,
        itCode,
      });
    } catch (e) {
      const msg = String(e.message || e);
      if (/无需|已审|免审|不能|已经|passed|skip/i.test(msg)) {
        console.log(`  skip ${node}: ${msg.slice(0, 100)}`);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const each = seedEach();
  console.log('='.repeat(60));
  console.log('datagen/run-full-nodes-all-bugs.js');
  console.log(`  env=${TEST_ENV || '(default)'} each=${each} fresh=${args.fresh} resume=${args.resume}`);
  console.log(`  from=${args.from || '(头)'} to=${args.to || '(尾)'} skipFront=${args.skipFront}`);
  console.log('='.repeat(60));

  let rec = loadRecord();
  let projectId = String(args.projectId || rec.project_id || '').trim();
  if (!args.fresh && args.resume && !projectId) {
    throw new Error('续跑需要 --project / PROJECT_ID / last_project.json');
  }

  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  const seeds = Array.isArray(rec.seed_vulns) ? [...rec.seed_vulns] : [];
  const pushSeeds = (rows) => {
    for (const r of rows || []) seeds.push(r);
  };

  try {
    if (!projectId || args.fresh) {
      const version = `datagen-full-js-${Date.now()}`;
      console.log(`\n===== 建项 ${version} =====`);
      const created = await createProjectFromTemplate(request, { version });
      projectId = String(created.projectId);
      rec = {
        project_id: projectId,
        product_version: created.version,
        kind: 'full_nodes_all_bugs_js',
        approved_nodes: [],
        seed_vulns: [],
      };
      saveRecord(rec);
      console.log(`OK pid=${projectId}`);
      console.log('\n===== 基本信息过审 =====');
      await approve(request, projectId, ['基本信息']);
      rec.approved_nodes = ['基本信息'];
      saveRecord(rec);
    } else {
      console.log(`♻️ RESUME pid=${projectId}`);
    }

    // —— 威胁：架构 / 数据 / 隐私 ——
    if (
      shouldRun('架构审核', args.from, args.to) ||
      shouldRun('数据安全', args.from, args.to) ||
      shouldRun('隐私安全', args.from, args.to)
    ) {
      console.log('\n===== 威胁造数（架构/数据/隐私）=====');
      const threatApi = await threatenApiAs(request, superAdmin());
      const specs = buildThreatSpecs({
        nodes: ['架构审核', '数据安全', '隐私安全'].filter((n) =>
          shouldRun(n, args.from, args.to),
        ),
        each,
      });
      console.log(`  create ${specs.length} 条`);
      const created = await threatApi.createThreats(projectId, specs);
      const plan = specs.map((s) => [s.level, s.status]);
      const st = await threatApi.applyStatusPlan(projectId, plan);
      console.log(`  status ${st.ok}/${st.total}`);
      pushSeeds(
        (created.created || []).map((c) => ({
          ...c,
          kind: 'threat',
          vuln_id: c.threat_id,
        })),
      );
      rec.seed_vulns = seeds;
      rec.threat_status = st;
      saveRecord(rec);

      console.log('\n===== 审批 架构/数据/隐私/源码 =====');
      await approve(request, projectId, ['架构审核', '数据安全', '隐私安全', '源代码安全']);
      rec.approved_nodes = [
        ...(rec.approved_nodes || []),
        '架构审核',
        '数据安全',
        '隐私安全',
        '源代码安全',
      ];
      saveRecord(rec);
    }

    // —— 开源 / 基线前台 ——
    if (
      !args.skipFront &&
      (shouldRun('开源组件安全', args.from, args.to) ||
        shouldRun('基线安全', args.from, args.to))
    ) {
      console.log('\n===== 前台开源/基线材料 =====');
      const front = await frontSubmitSeed(projectId, {
        includeOpensource: shouldRun('开源组件安全', args.from, args.to),
        includeBaseline: shouldRun('基线安全', args.from, args.to),
      });
      console.log('  front', JSON.stringify(front.report));
      rec.front_seed = front.report;
      saveRecord(rec);
      try {
        await approve(request, projectId, ['开源组件安全', '基线安全']);
      } catch (e) {
        console.log(`  审批开源/基线跳过: ${String(e.message || e).slice(0, 100)}`);
      }
    } else if (args.skipFront) {
      console.log('\n===== 跳过前台开源/基线（SKIP_FRONT）=====');
    }

    // —— 渗透 ——
    if (shouldRun('渗透测试', args.from, args.to)) {
      console.log('\n===== 渗透造洞+六态 =====');
      try {
        await approve(request, projectId, ['开源组件安全', '基线安全']);
      } catch {
        /* 可能已过或未开节点 */
      }
      const api = await loopholebApiAs(request, superAdmin());
      const plan = buildStatusPlan({
        levels: ['高危', '低危', '中危', '提示', '严重'],
        statuses: MATRIX_FILL_STATUSES,
      });
      // expand by each
      const specs = [];
      for (let n = 0; n < each; n += 1) {
        specs.push(...buildVulnCreateSpecs(plan));
      }
      const created = await api.createVulnsOnProject(projectId, specs);
      const st = await api.applyStatusPlan(
        projectId,
        specs.map((s) => [s.level, s.status]),
      );
      console.log(`  penet created=${created.created.length} status=${st.ok}/${st.total}`);
      pushSeeds(
        (created.created || []).map((c) => ({
          name: c.name,
          level: c.level,
          status: c.status,
          vuln_id: c.vuln_id,
          node: '渗透测试',
          kind: 'vuln',
        })),
      );
      rec.seed_vulns = seeds;
      rec.penet_status = st;
      saveRecord(rec);
      try {
        await approve(request, projectId, ['渗透测试']);
      } catch (e) {
        console.log(`  渗透审批: ${String(e.message || e).slice(0, 80)}`);
      }
    }

    // —— AI ——
    if (shouldRun('AI安全', args.from, args.to)) {
      console.log('\n===== AI complianceNote =====');
      try {
        const ai = await aiComplianceApiAs(request, superAdmin());
        const specs = buildAiSpecs({ each });
        const res = await ai.createNotes(projectId, specs);
        console.log(`  AI notes→official created=${res.created.length} official=${res.official}`);
        pushSeeds(
          (res.created || []).map((c) => ({
            ...c,
            node: 'AI安全',
            kind: 'ai',
          })),
        );
        rec.seed_vulns = seeds;
        rec.ai_seed = res;
        saveRecord(rec);
        try {
          await approve(request, projectId, ['AI安全']);
        } catch (e) {
          console.log(`  AI审批: ${String(e.message || e).slice(0, 80)}`);
        }
      } catch (e) {
        console.log(`  AI 失败（可继续）: ${String(e.message || e).slice(0, 160)}`);
      }
    }

    // —— 基建 ——
    if (shouldRun('网络基础设施审核', args.from, args.to)) {
      console.log('\n===== 基建导入+处置 =====');
      try {
        const infra = await cloudInfraApiAs(request, superAdmin());
        const specs = buildInfraSpecs({ each });
        const res = await infra.seedImportAndDispose(projectId, specs, { batchPass: true });
        console.log(
          `  infra listed=${res.listed} disposed=${res.disposed} passed=${res.passed}`,
        );
        pushSeeds(specs.map((s) => ({ ...s, kind: 'infra' })));
        rec.seed_vulns = seeds;
        rec.infra_seed = res;
        saveRecord(rec);
        try {
          await approve(request, projectId, ['网络基础设施审核']);
        } catch (e) {
          console.log(`  基建审批: ${String(e.message || e).slice(0, 80)}`);
        }
      } catch (e) {
        console.log(`  基建失败: ${String(e.message || e).slice(0, 200)}`);
      }
    }

    rec.seed_vulns = seeds;
    saveRecord(rec);
    console.log('\nDONE', {
      project_id: projectId,
      seeds: seeds.length,
      nodes: (rec.approved_nodes || []).length,
    });
  } finally {
    await request.dispose();
  }
}

main().catch((err) => {
  console.error('FAIL datagen:', err);
  process.exitCode = 1;
});
