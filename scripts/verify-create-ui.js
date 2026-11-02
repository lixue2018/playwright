#!/usr/bin/env node
/**
 * 仅验证 4834 UI 建项（EM01 create），KEEP_BROWSER=0 自动收尾。
 *   node scripts/verify-create-ui.js :216
 */
process.env.KEEP_BROWSER = process.env.KEEP_BROWSER || '0';
process.env.HEADED = process.env.HEADED || '1';

const { parseArgs } = require('./lib/prepare-4834-shared');
const ui = require('./lib/prepare-4834-ui');
const { request: pwRequest } = require('@playwright/test');

async function main() {
  parseArgs(process.argv.slice(2)); // 消费 :216
  console.log('[verify-create-ui] start EM01 create via=ui');
  const request = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    await ui.phaseCreate(request, { only: 'EM01' });
    console.log('[verify-create-ui] OK');
  } finally {
    await request.dispose();
  }
}

main().catch((err) => {
  console.error('[verify-create-ui] FAIL', err);
  process.exitCode = 1;
});
