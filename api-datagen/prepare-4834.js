#!/usr/bin/env node
/**
 * 4834 纯 API 造数入口（本目录专用）。
 *
 * 与页面造数分离：
 *   页面 → npm run prepare:4834（scripts/prepare-4834.js）
 *   API  → npm run prepare:4834:api 或 node api-datagen/prepare-4834.js
 *
 * 用法（在 playwright 根目录）：
 *   PSRB_TEST_ENV=216 npm run prepare:4834:api -- --phase all
 *   node api-datagen/prepare-4834.js --phase approve,shape --em01 5046 --em02 5047
 *   node api-datagen/prepare-4834.js --stop-at-gate g1
 *   node api-datagen/prepare-4834.js --focus-node 数据安全 --phase all
 */
const { request: pwRequest } = require('@playwright/test');
const { TEST_ENV } = require('../utils/env');
const {
  SPECS,
  NODE_GATES,
  bindExistingProjects,
  parseArgs,
  phasesForStopAtGate,
  loadData,
  persist,
} = require('../scripts/lib/prepare-4834-shared');
const api = require('./lib/prepare-4834-api');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // 本入口强制 API，忽略 shared 里写死的 via=ui
  args.via = 'api';

  const only = (args.only || '').trim() || null;
  if (only && !SPECS[only]) {
    console.error(`unknown key ${only}，可选 ${Object.keys(SPECS)}`);
    process.exitCode = 2;
    return;
  }

  let phases = String(args.phase || 'all')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (phases.includes('all')) phases = ['create', 'approve', 'shape'];
  if (phases.includes('advance')) {
    console.error('API 造数不支持 --phase advance（推进闸道请用页面：npm run prepare:4834 -- --phase advance）');
    process.exitCode = 2;
    return;
  }
  try {
    phases = phasesForStopAtGate(phases, args.stopAtGate);
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 2;
    return;
  }

  console.log(`[api-datagen/prepare-4834] via=api phases=${phases.join(',') || '(none)'}`);
  if (args.stopAtGate) {
    const g = NODE_GATES[String(args.stopAtGate).toLowerCase()];
    if (g) console.log(`[api-datagen] gate=${g.id} nodes=${g.nodes.join('、')} · ${g.unlock}`);
  }
  if (args.focusNode) {
    process.env.PSRB_FOCUS_NODE = args.focusNode;
    console.log(`[api-datagen] focus-node=${args.focusNode}`);
  }

  if (args.em01 || args.em02 || phases.includes('bind')) {
    bindExistingProjects({ em01: args.em01, em02: args.em02 });
  }

  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  /** @type {{ ok: number, skip: number, fail: number, rows: string[] }} */
  let lastStats = { ok: 0, skip: 0, fail: 0, rows: [] };
  try {
    if (phases.includes('create')) {
      if (args.em01 && args.em02 && !only) {
        console.log('[造数] EM01/EM02 均已指定旧编号，跳过新建项目');
      } else if (only && ((only === 'EM01' && args.em01) || (only === 'EM02' && args.em02))) {
        console.log(`[造数] ${only} 已绑定旧编号，跳过新建`);
      } else if (args.em01 || args.em02) {
        for (const key of only ? [only] : Object.keys(SPECS)) {
          if (key === 'EM01' && args.em01) continue;
          if (key === 'EM02' && args.em02) continue;
          await api.phaseCreate(request, { only: key });
        }
      } else {
        await api.phaseCreate(request, { only });
      }
    }
    if (phases.includes('approve')) await api.phaseApprove(request, { only });
    if (phases.includes('shape')) {
      const s = await api.phaseShape(request, { only });
      if (s) lastStats = s;
    }
  } finally {
    await request.dispose();
  }

  if (args.stopAtGate || args.focusNode) {
    const data = loadData();
    if (args.stopAtGate) data.stop_at_gate = String(args.stopAtGate).toLowerCase();
    if (args.focusNode) data.focus_node = args.focusNode;
    data.prepare_via = 'api';
    persist(data, data.note || 'api-datagen/prepare-4834');
  }

  const phaseCn = {
    create: '新建项目',
    approve: '基本信息审批',
    shape: '打节点态',
    bind: '绑定旧项目',
  };
  console.log('\n========== API 造数结果（不是用例测试）==========');
  console.log(`环境：${TEST_ENV || '默认'}　方式：接口`);
  console.log(`步骤：${phases.map((p) => phaseCn[p] || p).join(' → ') || '无'}`);
  if (args.focusNode) console.log(`焦点节点：${args.focusNode}`);
  if (lastStats.rows.length) {
    for (const line of lastStats.rows) console.log(`  · ${line}`);
  }
  console.log(`合计：成功 ${lastStats.ok}　跳过 ${lastStats.skip}　失败 ${lastStats.fail}`);
  console.log('==============================================');
  console.log('提示：页面冒烟仍用：PSRB_TEST_ENV=216 npm run test:smoke');
  console.log('');
}

main().catch((err) => {
  console.error('\nAPI 造数失败：', err.message || err);
  process.exitCode = 1;
});
