#!/usr/bin/env node
/**
 * 5449 造数：新建 PSRB 项目 + 需求相关节点样本
 *
 * 重要：默认只过「基本信息」，**不再免审**架构/数据/隐私，以便这些节点保持开启可测修复编号。
 * 若还要推进渗透/开源等，另跑 --phase unlock（会免审 G1，节点会变成免审态）。
 *
 * 用法：
 *   npm run prepare:5449 -- --fresh --phase all :216
 *   npm run prepare:5449 -- --phase create :216
 *   npm run prepare:5449 -- --phase samples --project-id xxx :216
 *   npm run prepare:5449 -- --phase unlock --project-id xxx :216
 *
 * 样本：
 *   threaten 架构A/隐私B/数据C；ai A/B/C；penet A/B/C；network N1/N2
 */
const fs = require('fs');
const path = require('path');
const { chromium, request: pwRequest } = require('@playwright/test');
const {
  ROOT,
  TEST_ENV,
  API_BASE_URL,
  loadFixture5449,
  saveFixture5449,
  loadFixture4869,
  env,
} = require('../utils/env');
const {
  createProjectFromTemplate,
  approveNode,
  accountsForFixture,
} = require('../utils/project-audit-api');
const { frontOwner, superAdmin } = require('../utils/accounts');
const { fetchAccessToken } = require('../utils/api-helper');
const { paintAuth, ensureSharedContext } = require('../utils/browser-auth');
const { createProjectUi } = require('./stages/create-project-ui');
const { loopholebApiAs } = require('../utils/loopholeb-api');
const { threatenApiAs } = require('../utils/threaten-api');
const { cloudInfraApiAs } = require('../utils/cloud-infra-api');
const { repairProjectApiAs, LOOPHOLE_STATUS } = require('../utils/repair-project-api');

const OUT_FALLBACK = path.join(ROOT, 'fixtures', '5449', 'fixture_projects.json');

/** 默认只过基本信息，保持架构/数据/隐私/AI 可测 */
const APPROVE_BASIC_ONLY = ['基本信息'];
/** 可选：推进到渗透前的闸道（会把 G1 置免审） */
const APPROVE_UNLOCK_G2 = [
  '架构审核',
  '数据安全',
  '隐私安全',
  '源代码安全',
  '开源组件安全',
  '基线安全',
];

function parseArgs(argv) {
  const out = {
    phase: 'all',
    projectId: env('PSRB_5449_PROJECT_ID', ''),
    bindN07: false,
    /** ui | api，默认 ui */
    via: env('PSRB_5449_CREATE_VIA', 'ui'),
    /** 忽略 fixture 里已有 project_id，强制新建 */
    fresh: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--phase') out.phase = argv[++i] || out.phase;
    else if (a.startsWith('--phase=')) out.phase = a.slice('--phase='.length);
    else if (a === '--project-id' || a === '--project') out.projectId = argv[++i] || '';
    else if (a.startsWith('--project-id=')) out.projectId = a.slice('--project-id='.length);
    else if (a.startsWith('--project=')) out.projectId = a.slice('--project='.length);
    else if (a === '--bind-n07') out.bindN07 = true;
    else if (a === '--fresh' || a === '--no-reuse') out.fresh = true;
    else if (a === '--via') out.via = String(argv[++i] || out.via).toLowerCase();
    else if (a.startsWith('--via=')) out.via = String(a.slice('--via='.length)).toLowerCase();
  }
  return out;
}

async function createProjectViaUi(version) {
  const headed = String(process.env.HEADED || '').trim() === '1';
  const browser = await chromium.launch({ headless: !headed });
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    const context = await ensureSharedContext(browser, 'front');
    const page = await context.newPage();
    const token = await fetchAccessToken(api, frontOwner());
    await paintAuth(page, 'front', token);
    const created = await createProjectUi(page, {
      version,
      // Windows APP + Web：尽量带上网络相关组成；生成式 AI 在表单里勾「是」
      components: ['Windows APP', 'Web服务（业务面）'],
      allowMissingComponents: true,
    });
    await page.close({ runBeforeUnload: false }).catch(() => {});
    return created;
  } finally {
    await api.dispose();
    await browser.close().catch(() => {});
  }
}

function loadData() {
  return loadFixture5449() || {};
}

function persist(data) {
  const out = {
    ...data,
    accounts: accountsForFixture(),
    test_env: TEST_ENV || '',
    api_host: API_BASE_URL,
    note: '由 scripts/prepare-5449.js 生成（create + 5449 样本）',
    updated_at: new Date().toISOString().slice(0, 19),
  };
  try {
    const p = saveFixture5449(out);
    console.log(`[prepare-5449] fixture → ${p}`);
    return p;
  } catch (e) {
    fs.mkdirSync(path.dirname(OUT_FALLBACK), { recursive: true });
    fs.writeFileSync(OUT_FALLBACK, JSON.stringify(out, null, 2), 'utf8');
    console.log(`[prepare-5449] fixture → ${OUT_FALLBACK} (${e.message})`);
    return OUT_FALLBACK;
  }
}

async function approveNodes(request, projectId, nodes, { optional = false } = {}) {
  const itCode = superAdmin();
  for (const node of nodes) {
    const result = node === '基本信息' ? '审批通过' : '免审';
    console.log(`  审批 ${node} → ${result}`);
    try {
      await approveNode(request, projectId, node, {
        approvalResult: result,
        remark: `5449造数-${node}`,
        itCode,
      });
    } catch (e) {
      const msg = String(e.message || e);
      if (
        optional ||
        /无需|已审|免审|不能|已经|passed|skip|材料|未开启|终审|无法修改/i.test(msg)
      ) {
        console.log(`  skip ${node}: ${msg.slice(0, 120)}`);
        continue;
      }
      throw e;
    }
  }
}

function resolveBindProjectId(args) {
  if (args.fresh) return '';
  if (args.projectId) return String(args.projectId).trim();
  if (args.bindN07) {
    const fx = loadFixture4869() || {};
    const id = fx.N07?.project_id || fx.D01?.project_id;
    if (id) return String(id);
  }
  const cur = loadData();
  if (cur.project_id) return String(cur.project_id);
  return '';
}

async function phaseCreate(request, args) {
  const data = loadData();
  let projectId = resolveBindProjectId(args);
  let version = data.product_version || '';

  if (!projectId) {
    const ver = `${env('PSRB_VERSION_PREFIX', '5449修复项目编号')}-js-${Date.now()}`;
    const via = args.via === 'api' ? 'api' : 'ui';
    console.log(`\n===== create project via=${via} version=${ver} =====`);
    let created;
    if (via === 'api') {
      try {
        created = await createProjectFromTemplate(request, { version: ver });
      } catch (e) {
        console.log(`  API 建项失败，回退 UI: ${String(e.message || e).slice(0, 160)}`);
        created = await createProjectViaUi(ver);
      }
    } else {
      created = await createProjectViaUi(ver);
    }
    projectId = String(created.projectId);
    version = created.version;
    data.prepare_via = via;
    console.log(`OK project_id=${projectId}`);
  } else {
    console.log(`\n===== reuse project_id=${projectId}（跳过建项）=====`);
  }

  console.log('\n===== 仅基本信息过审（架构/数据/隐私/AI 保持可开启测）=====');
  await approveNodes(request, projectId, APPROVE_BASIC_ONLY);

  Object.assign(data, {
    key: 'R5449',
    project_id: String(projectId),
    product_version: version || data.product_version || '',
    target_nodes: ['架构审核', '数据安全', '隐私安全', 'AI安全', '渗透测试', '网络基础设施审核'],
    g1_kept_open: true,
    approve_before: APPROVE_BASIC_ONLY,
    env: TEST_ENV || '',
  });
  persist(data);
  return data;
}

async function phaseUnlock(request, args) {
  const data = loadData();
  const projectId = String(args.projectId || data.project_id || '').trim();
  if (!projectId) throw new Error('unlock 需要 project_id');
  console.log(`\n===== unlock G2（将对架构/数据/隐私等免审）pid=${projectId} =====`);
  await approveNodes(request, projectId, APPROVE_UNLOCK_G2, { optional: true });
  data.g1_kept_open = false;
  data.unlocked_g2 = true;
  persist(data);
  return data;
}

async function phaseSamples(request, args) {
  const data = loadData();
  const projectId = String(args.projectId || data.project_id || '').trim();
  if (!projectId) {
    throw new Error('samples 需要 project_id：先 --phase create，或 --project-id / PSRB_5449_PROJECT_ID');
  }
  console.log(`\n===== 5449 samples on project=${projectId} =====`);

  const loop = await loopholebApiAs(request, superAdmin());
  const thr = await threatenApiAs(request, superAdmin());
  const infra = await cloudInfraApiAs(request, superAdmin());
  const rp = await repairProjectApiAs(request, superAdmin());

  let repairCode = env('PSRB_5449_REPAIR_CODE');
  if (!repairCode) {
    try {
      repairCode = await rp.pickRepairProjectCode([Number(projectId)]);
    } catch {
      repairCode = await rp.pickRepairProjectCode();
    }
  }
  console.log(`[5449] repairProject candidate=${repairCode}`);

  const ts = Date.now();

  // —— 渗透 ——
  // 遗留仅允许中危及以下；B 用低危更稳（中危在部分项目态下会被拒绝遗留）
  const penetSpecs = [
    { level: '低危', status: '遗留', name: `5449-PEN-A-遗留-${ts}` },
    { level: '低危', status: '待修复', name: `5449-PEN-B-待修-${ts}` },
    { level: '提示', status: '待修复', name: `5449-PEN-C-待修复-${ts}` },
  ];
  console.log('\n----- 渗透造洞 -----');
  const penetCreated = await loop.createVulnsOnProject(projectId, penetSpecs);
  // 必须用本次创建返回的 id，避免 list 命中历史同名前缀洞（曾用高危造 B 会导致遗留失败）
  const createdRows = Array.isArray(penetCreated?.created) ? penetCreated.created : [];
  const byCreatedName = (frag) => createdRows.find((c) => String(c.name || '').includes(frag));
  const sampleA = byCreatedName('5449-PEN-A');
  const sampleB = byCreatedName('5449-PEN-B');
  const sampleC = byCreatedName('5449-PEN-C');
  if (sampleA) sampleA.id = sampleA.vuln_id || sampleA.id;
  if (sampleB) sampleB.id = sampleB.vuln_id || sampleB.id;
  if (sampleC) sampleC.id = sampleC.vuln_id || sampleC.id;

  // 先造 B 的曾遗留轨迹，再把 A 留在遗留（部分环境下同时多条遗留会被拒）
  if (sampleB?.id) {
    const toLegacy = await loop.setStatus(sampleB.id, '遗留');
    if (!toLegacy.ok) throw new Error(`B 置遗留失败: ${toLegacy.err || ''}`);
    const toFix = await loop.setStatus(sampleB.id, '待修复');
    if (!toFix.ok) throw new Error(`B 遗留改待修复失败: ${toFix.err || ''}`);
    const check = await rp.getLoopholeb(sampleB.id);
    if (!check.everRemained) {
      console.log(`  WARN B id=${sampleB.id} everRemained 仍为 false，日志可能未写入`);
    }
    console.log(`  B id=${sampleB.id} → 遗留→待修复 everRemained=${!!check.everRemained}`);
  }
  if (sampleA?.id) {
    const toLegacyA = await loop.setStatus(sampleA.id, '遗留');
    if (!toLegacyA.ok) throw new Error(`A 置遗留失败: ${toLegacyA.err || ''}`);
    console.log(`  A id=${sampleA.id} → 遗留`);
  }
  if (sampleC?.id) {
    await loop.setStatus(sampleC.id, '待修复');
    console.log(`  C id=${sampleC.id} → 待修复（从未遗留）`);
  }
  // —— 威胁 ——
  console.log('\n----- 威胁造数 -----');
  const threatSpecs = [
    { node: '架构审核', level: '中危', name: `5449-THR-A-${ts}` },
    { node: '隐私安全', level: '中危', name: `5449-THR-B-${ts}` },
    { node: '数据安全', level: '低危', name: `5449-THR-C-${ts}` },
  ];
  const thrCreated = await thr.createThreats(projectId, threatSpecs);
  const thrCreatedRows = Array.isArray(thrCreated?.created) ? thrCreated.created : [];
  const thrA = thrCreatedRows.find((r) => String(r.name).includes('5449-THR-A'));
  const thrB = thrCreatedRows.find((r) => String(r.name).includes('5449-THR-B'));
  const thrC = thrCreatedRows.find((r) => String(r.name).includes('5449-THR-C'));
  if (thrA) thrA.id = thrA.threat_id || thrA.id;
  if (thrB) thrB.id = thrB.threat_id || thrB.id;
  if (thrC) thrC.id = thrC.threat_id || thrC.id;

  if (thrB?.id) {
    await thr.batchAudit([thrB.id], '遗留', { projectId });
    await thr.batchAudit([thrB.id], '待修复', { projectId });
    console.log(`  THR-B id=${thrB.id} → 遗留→待修复`);
  }
  if (thrA?.id) {
    await thr.batchAudit([thrA.id], '遗留', { projectId });
    console.log(`  THR-A id=${thrA.id} → 遗留`);
  }
  if (thrC?.id) {
    await thr.batchAudit([thrC.id], '待修复', { projectId });
    console.log(`  THR-C id=${thrC.id} → 待修复`);
  }

  // —— AI 安全（与渗透同 F-002）——
  console.log('\n----- AI 安全造数 -----');
  let aiA = null;
  let aiB = null;
  let aiC = null;
  try {
    const cA = await rp.createAiSecurity(projectId, {
      name: `5449-AI-A-遗留-${ts}`,
      level: '低危',
    });
    const cB = await rp.createAiSecurity(projectId, {
      name: `5449-AI-B-待修-${ts}`,
      level: '低危',
    });
    const cC = await rp.createAiSecurity(projectId, {
      name: `5449-AI-C-待修复-${ts}`,
      level: '提示',
    });
    if (cB?.id) {
      await rp.batchAuditAiSecurity([cB.id], LOOPHOLE_STATUS['遗留']);
      await rp.batchAuditAiSecurity([cB.id], LOOPHOLE_STATUS['待修复']);
      console.log(`  AI-B id=${cB.id} → 遗留→待修复`);
      aiB = { id: cB.id, name: cB.name, note: '曾遗留' };
    }
    if (cA?.id) {
      await rp.batchAuditAiSecurity([cA.id], LOOPHOLE_STATUS['遗留']);
      console.log(`  AI-A id=${cA.id} → 遗留`);
      aiA = { id: cA.id, name: cA.name, note: '遗留' };
    }
    if (cC?.id) {
      await rp.batchAuditAiSecurity([cC.id], LOOPHOLE_STATUS['待修复']);
      console.log(`  AI-C id=${cC.id} → 待修复`);
      aiC = { id: cC.id, name: cC.name, note: '从未遗留' };
    }
  } catch (e) {
    console.log(`  AI 造数失败（可继续）: ${String(e.message || e).slice(0, 200)}`);
  }

  // —— 网络（用官方模板导入；不批量通过，留给 F-005 测）——
  console.log('\n----- 网络基建导入 -----');
  let infraSeed = null;
  let netHits = [];
  try {
    const tpl = path.join(ROOT, 'file', '基础设施审核-导入漏洞模板.xlsx');
    if (!fs.existsSync(tpl)) throw new Error(`缺少模板 ${tpl}`);
    const beforeIds = new Set(
      (await infra.list(projectId)).map((r) => Number(r.id)).filter(Boolean),
    );
    const imp = await infra.importXlsx(projectId, tpl);
    if (!imp.ok) throw new Error(imp.error || 'import failed');
    let infraRows = [];
    for (let i = 0; i < 10; i += 1) {
      infraRows = await infra.list(projectId);
      if (infraRows.some((r) => !beforeIds.has(Number(r.id)))) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    netHits = infraRows.filter((r) => !beforeIds.has(Number(r.id))).slice(0, 2);
    if (netHits.length < 2) netHits = infraRows.slice(0, 2);
    infraSeed = { imported: true, path: tpl, listed: infraRows.length, new: netHits.length };
    console.log(`  infra listed=${infraRows.length} new≈${netHits.length}`);
  } catch (e) {
    console.log(`  基建失败（可继续）: ${String(e.message || e).slice(0, 200)}`);
  }

  Object.assign(data, {
    project_id: String(projectId),
    repair_project: repairCode,
    penet: {
      A: sampleA
        ? { id: Number(sampleA.id), name: sampleA.name, note: '遗留→可直修已修复' }
        : null,
      B: sampleB
        ? { id: Number(sampleB.id), name: sampleB.name, note: '曾遗留→待修复' }
        : null,
      C: sampleC
        ? { id: Number(sampleC.id), name: sampleC.name, note: '从未遗留待修复' }
        : null,
      created: penetCreated,
    },
    threaten: {
      A: thrA
        ? { id: Number(thrA.id), name: thrA.name, node: '架构审核', note: '遗留' }
        : null,
      B: thrB
        ? { id: Number(thrB.id), name: thrB.name, node: '隐私安全', note: '曾遗留' }
        : null,
      C: thrC
        ? { id: Number(thrC.id), name: thrC.name, node: '数据安全', note: '从未遗留' }
        : null,
    },
    ai: { A: aiA, B: aiB, C: aiC },
    network: {
      seed: infraSeed,
      N1: netHits[0]
        ? { id: Number(netHits[0].id), name: netHits[0].name || netHits[0].loopholeName }
        : null,
      N2: netHits[1]
        ? { id: Number(netHits[1].id), name: netHits[1].name || netHits[1].loopholeName }
        : null,
    },
    g1_kept_open: data.g1_kept_open !== false,
  });

  persist(data);
  console.log('\n[prepare-5449] samples summary', {
    project_id: data.project_id,
    repair_project: data.repair_project,
    g1_kept_open: data.g1_kept_open,
    penet: { A: data.penet.A?.id, B: data.penet.B?.id, C: data.penet.C?.id },
    threaten: { A: data.threaten.A?.id, B: data.threaten.B?.id, C: data.threaten.C?.id },
    ai: { A: data.ai?.A?.id, B: data.ai?.B?.id, C: data.ai?.C?.id },
    network: { N1: data.network.N1?.id, N2: data.network.N2?.id },
  });
  return data;
}

function phaseBind(args) {
  const pid = resolveBindProjectId(args);
  if (!pid) throw new Error('bind 需要 --project-id 或 --bind-n07');
  const data = loadData();
  data.project_id = String(pid);
  data.key = 'R5449';
  data.reused = true;
  if (args.bindN07) {
    const fx = loadFixture4869() || {};
    data.product_version = fx.N07?.product_version || data.product_version;
    data.bound_from = '4869.N07';
  }
  persist(data);
  console.log(`[prepare-5449] 绑定 project_id=${pid}`);
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let phases = String(args.phase || 'all')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (phases.includes('all')) phases = ['create', 'samples'];

  console.log('='.repeat(60));
  console.log('prepare-5449');
  console.log(
    `  env=${TEST_ENV || '(default)'} phases=${phases.join(',')} via=${args.via} project=${args.projectId || '(new/reuse fixture)'}`,
  );
  console.log('='.repeat(60));

  if (phases.includes('bind') || args.bindN07) {
    phaseBind(args);
    if (!phases.includes('samples') && !phases.includes('create') && !phases.includes('unlock')) {
      console.log('DONE prepare-5449 bind-only');
      return;
    }
  }

  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    if (phases.includes('create')) await phaseCreate(request, args);
    if (phases.includes('samples')) await phaseSamples(request, args);
    if (phases.includes('unlock')) await phaseUnlock(request, args);
  } finally {
    await request.dispose();
  }
  console.log('DONE prepare-5449', phases, `env=${TEST_ENV || '(default)'}`);
}

main().catch((err) => {
  console.error('FAIL prepare-5449:', err);
  process.exitCode = 1;
});
