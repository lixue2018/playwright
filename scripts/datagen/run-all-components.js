#!/usr/bin/env node
/**
 * 全量产品组成建项 + 基本信息过审（不造威胁/漏洞）。
 * 对齐 AT_py/造数/project_all_components.py
 *
 * 用法（在 playwright/ 根目录）：
 *   npm run datagen:components -- :216
 *   npm run datagen:components -- --fresh :pre
 *   KEEP_BROWSER=0 npm run datagen:components -- :216
 */
const fs = require('fs');
const path = require('path');
const { chromium, request: pwRequest } = require('@playwright/test');
const { TEST_ENV, API_BASE_URL, env, ROOT } = require('../../utils/env');
const { allComponentNames } = require('../../utils/components');
const { createProjectUi } = require('../stages/create-project-ui');
const { approveNode, accountsForFixture } = require('../../utils/project-audit-api');
const { frontOwner, superAdmin } = require('../../utils/accounts');
const { fetchAccessToken } = require('../../utils/api-helper');
const { paintAuth, ensureSharedContext } = require('../../utils/browser-auth');
const { keepBrowserEnabled, pauseKeepBrowser } = require('../../utils/keep-browser');

const LOG_DIR = path.join(ROOT, 'logs', 'datagen');
const LAST_PROJECT = path.join(LOG_DIR, 'last_project.json');

function parseArgs(argv) {
  const out = {
    fresh: true,
    approveBasic: true,
    allowMissing: env('ALLOW_MISSING_COMPONENTS', '') === '1',
    version: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fresh' || a === '--no-resume') out.fresh = true;
    else if (a === '--no-approve' || a === '--skip-approve') out.approveBasic = false;
    else if (a === '--allow-missing') out.allowMissing = true;
    else if (a === '--version') out.version = argv[++i] || '';
    else if (a.startsWith('--version=')) out.version = a.split('=').slice(1).join('=');
  }
  return out;
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
  console.log(`[datagen:components] → ${LAST_PROJECT}`);
  return out;
}

function resolveSlowMo() {
  const raw = process.env.SLOW_MO;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const components = allComponentNames();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const version = args.version || `all-components-js-${stamp}`;

  console.log('='.repeat(60));
  console.log('datagen/run-all-components.js');
  console.log(`  env=${TEST_ENV || '(default)'} version=${version}`);
  console.log(`  components=${components.length} approveBasic=${args.approveBasic}`);
  console.log(`  list=${components.join(' | ')}`);
  console.log('='.repeat(60));

  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  const browser = await chromium.launch({
    headless: String(process.env.HEADED || '').trim() === '0',
    slowMo: resolveSlowMo(),
  });

  let projectId = '';
  let page;
  try {
    const context = await ensureSharedContext(browser, 'front');
    const token = await fetchAccessToken(request, frontOwner());
    page = await context.newPage();
    await paintAuth(page, 'front', token);

    console.log('\n===== 前台建项（全量产品组成）=====');
    const created = await createProjectUi(page, {
      version,
      allComponents: true,
      components,
      delivery: env('PSRB_DELIVERY_OPTION', '容器化交付'),
      deployMode: env('PSRB_DEPLOY_MODE', '私有化部署'),
      deploySecond: env('PSRB_DEPLOY_SECOND', '容器交付'),
      allowMissingComponents: args.allowMissing,
    });
    projectId = String(created.projectId);
    console.log(`OK pid=${projectId}`);

    const approved = [];
    if (args.approveBasic) {
      console.log('\n===== 基本信息过审（API，不造漏洞）=====');
      try {
        await approveNode(request, projectId, '基本信息', {
          approvalResult: '审批通过',
          remark: 'datagen-all-components',
          itCode: superAdmin(),
        });
        approved.push('基本信息');
        console.log('OK 基本信息审批通过');
      } catch (e) {
        const msg = String(e.message || e);
        if (/无需|已审|免审|不能|已经|passed|skip/i.test(msg)) {
          approved.push('基本信息');
          console.log(`skip 基本信息: ${msg.slice(0, 120)}`);
        } else {
          throw e;
        }
      }
    }

    const rec = saveRecord({
      kind: 'project_all_components',
      project_id: projectId,
      project_no: projectId,
      product_version: created.version || version,
      version: created.version || version,
      audit_mode: '全量审核',
      components: created.components || components,
      delivery_method: created.delivery || '容器化交付',
      deploy_mode: env('PSRB_DEPLOY_MODE', '私有化部署'),
      deploy_second: env('PSRB_DEPLOY_SECOND', '容器交付'),
      approved_nodes: approved,
      seed_vulns: [],
      no_vuln: true,
      created_projects: [
        {
          id: 'full_components',
          label: '全量产品组成',
          project_id: projectId,
        },
      ],
    });

    console.log('\n完成');
    console.log(`  project_id=${rec.project_id}`);
    console.log(`  components=${(rec.components || []).length}`);
    console.log('  seed_vulns=[]（未造漏洞）');
  } catch (err) {
    if (keepBrowserEnabled() && page && !page.isClosed()) {
      await pauseKeepBrowser(page, err.message || String(err));
    }
    throw err;
  } finally {
    await request.dispose().catch(() => {});
    if (!keepBrowserEnabled()) {
      await browser.close().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('[datagen:components] FAIL', err);
  process.exitCode = 1;
});
