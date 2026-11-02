#!/usr/bin/env node
/**
 * 4834 造数（JS）：只建项目 + 打节点态，不造威胁/漏洞。
 * 仅页面操作（建项/审批）。
 *
 * 纯 API 造数请用独立目录：
 *   npm run prepare:4834:api
 *   node api-datagen/prepare-4834.js
 *   说明：api-datagen/README.md
 *
 * 用法（在 playwright 根目录）：
 *   node scripts/prepare-4834.js --phase all
 *   PSRB_TEST_ENV=216 npm run prepare:4834 -- --phase approve,shape --em01 5046 --em02 5047
 */
const { TEST_ENV } = require('../utils/env');
const {
  SPECS,
  NODE_GATES,
  bindExistingProjects,
  parseArgs,
  phasesForStopAtGate,
  loadData,
  persist,
} = require('./lib/prepare-4834-shared');
const ui = require('./lib/prepare-4834-ui');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.via === 'api') {
    console.error(
      '页面入口已禁用接口造数。请改用：\n  npm run prepare:4834:api\n  或：node api-datagen/prepare-4834.js\n说明见 api-datagen/README.md',
    );
    process.exitCode = 2;
    return;
  }
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
  if (phases.includes('advance') && !args.advanceGate) args.advanceGate = 'g1';
  try {
    phases = phasesForStopAtGate(phases, args.stopAtGate);
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 2;
    return;
  }

  console.log(`[prepare-4834] via=ui phases=${phases.join(',') || '(none)'}`);
  if (args.stopAtGate) {
    const g = NODE_GATES[String(args.stopAtGate).toLowerCase()];
    if (g) console.log(`[prepare-4834] gate=${g.id} nodes=${g.nodes.join('、')} · ${g.unlock}`);
  }
  if (args.advanceGate) {
    const g = NODE_GATES[String(args.advanceGate).toLowerCase()];
    if (g) console.log(`[prepare-4834] advance-gate=${g.id}（旧项目推进，少浪费）`);
  }
  if (args.focusNode) {
    process.env.PSRB_FOCUS_NODE = args.focusNode;
    console.log(`[prepare-4834] focus-node=${args.focusNode}（单节点闭环，少换审核人）`);
  }

  if (args.em01 || args.em02 || phases.includes('bind')) {
    bindExistingProjects({ em01: args.em01, em02: args.em02 });
  }

  /** @type {{ ok: number, skip: number, fail: number, rows: string[] }} */
  let lastStats = { ok: 0, skip: 0, fail: 0, rows: [] };
  if (phases.includes('create')) {
    if (args.em01 && args.em02 && !only) {
      console.log('[造数] EM01/EM02 均已指定旧编号，跳过新建项目');
    } else if (only && ((only === 'EM01' && args.em01) || (only === 'EM02' && args.em02))) {
      console.log(`[造数] ${only} 已绑定旧编号，跳过新建`);
    } else if (args.em01 || args.em02) {
      for (const key of only ? [only] : Object.keys(SPECS)) {
        if (key === 'EM01' && args.em01) continue;
        if (key === 'EM02' && args.em02) continue;
        await ui.phaseCreate(null, { only: key });
      }
    } else {
      await ui.phaseCreate(null, { only });
    }
  }
  if (phases.includes('approve')) await ui.phaseApprove(null, { only });
  if (phases.includes('shape')) {
    const s = await ui.phaseShape(null, { only });
    if (s) lastStats = s;
  }
  if (phases.includes('advance')) {
    const s = await ui.phaseAdvance(null, { only, advanceGate: args.advanceGate || 'g1' });
    if (s) lastStats = s;
  }

  if (args.stopAtGate || args.focusNode) {
    const data = loadData();
    if (args.stopAtGate) data.stop_at_gate = String(args.stopAtGate).toLowerCase();
    if (args.focusNode) data.focus_node = args.focusNode;
    persist(data, data.note || 'prepare-4834');
  }

  const phaseCn = {
    create: '新建项目',
    approve: '基本信息审批',
    shape: '打节点态',
    advance: '推进闸道',
    bind: '绑定旧项目',
  };
  console.log('\n========== 造数结果（不是用例测试）==========');
  console.log(`环境：${TEST_ENV || '默认'}　方式：页面`);
  console.log(`步骤：${phases.map((p) => phaseCn[p] || p).join(' → ') || '无'}`);
  if (args.focusNode) console.log(`焦点节点：${args.focusNode}`);
  if (lastStats.rows.length) {
    for (const line of lastStats.rows) console.log(`  · ${line}`);
  }
  console.log(`合计：成功 ${lastStats.ok}　跳过 ${lastStats.skip}　失败 ${lastStats.fail}`);
  console.log('==========================================');
  console.log('提示：上面只是造数。要接着跑用例请执行：');
  console.log('  PSRB_TEST_ENV=216 npm run test:smoke');
  console.log('或一键：PSRB_TEST_ENV=216 npm run test:4834');
  console.log('');
}

main().catch((err) => {
  console.error('\n造数失败：', err.message || err);
  process.exitCode = 1;
});
