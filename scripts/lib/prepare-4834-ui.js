/**
 * 4834 造数 — 仅页面：前台建项 + 后台页面审批打节点态。
 * 读节点态：打开前台页，拦截页面自己的 getNavStatus（不直接调业务 API 写/造数）。
 * 登录态：仍用 token 注入（仅换账号，不参与建数审批）。
 *
 * 状态池：docs/4834/造数状态池与用例消耗.md
 */
const { chromium, request: pwRequest } = require('@playwright/test');
const { frontOwner, superAdmin, auditorForLocation } = require('../../utils/accounts');
const { fetchAccessToken } = require('../../utils/api-helper');
const { NODE_LOCATION } = require('../../utils/rules');
const {
  dumpNav,
  firstOpenSecurityNode,
  readNavMapFromPage,
} = require('../../utils/nav-from-page');
const { createProjectUi } = require('../stages/create-project-ui');
const { approveNodeUi } = require('../stages/approve-node-ui');
const { keepBrowserEnabled, pauseKeepBrowser } = require('../../utils/keep-browser');
const { paintAuth, ensureSharedContext } = require('../../utils/browser-auth');
const { resolveFocusNode, NODE_GATES } = require('../../utils/node-order');
const {
  SPECS,
  loadData,
  persist,
  makeVersion,
  sacrificeLeftEnabled,
  applyNodeRoles,
} = require('./prepare-4834-shared');

const GATE_DONE = new Set([2, 21, 101, 102, 100, 11]);
const ST_PAUSE = 99;
const ST_NOT_OPEN = 103;

/** @type {{ browser: import('@playwright/test').Browser, api: import('@playwright/test').APIRequestContext } | null} */
let shared = null;

function resolveSlowMo() {
  const raw = process.env.SLOW_MO;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

async function ensureBrowser() {
  if (shared?.browser) return shared;
  // api 上下文仅用于登录取 token，禁止用于建项/审批/写业务
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  const browser = await chromium.launch({
    headless: String(process.env.HEADED || '').trim() === '0',
    slowMo: resolveSlowMo(),
  });
  shared = { browser, api };
  console.log('[prepare-4834-ui] 已启动共用浏览器（后续账号用新标签）');
  return shared;
}

async function withBrowser(side, itCode, fn) {
  const { browser, api } = await ensureBrowser();
  const context = await ensureSharedContext(browser, side);
  const token = await fetchAccessToken(api, itCode);
  const page = await context.newPage();
  try {
    await paintAuth(page, side, token);
    const result = await fn({ page, browser, context });
    await page.close({ runBeforeUnload: false }).catch(() => {});
    return result;
  } catch (err) {
    if (keepBrowserEnabled() && page && !page.isClosed()) {
      await pauseKeepBrowser(page, err.message || String(err));
    } else {
      await page.close({ runBeforeUnload: false }).catch(() => {});
    }
    throw err;
  }
}

/** 前台打开项目，用页面自身 getNavStatus 读导航态 */
async function readNav(pid) {
  return withBrowser('front', frontOwner(), async ({ page }) => readNavMapFromPage(page, pid));
}

async function phaseCreate(_unused, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'ui';

  await withBrowser('front', frontOwner(), async ({ page }) => {
    for (const key of keys) {
      const version = makeVersion(key);
      console.log(`\n===== ${key} create(UI) version=${version} =====`);
      const { projectId, version: ver } = await createProjectUi(page, { version });
      const row = { ...(data[key] || {}) };
      Object.assign(row, {
        project_id: String(projectId),
        product_version: ver,
        kind: key,
        note: SPECS[key].note,
        no_vuln: true,
        basic_approved: false,
        exempt_node: undefined,
        pause_ok_node: null,
        pause_ok_location: null,
        pause_ok_second_audit: 0,
        paused_node: undefined,
        paused_location: undefined,
        paused_second_audit: undefined,
        node_roles: undefined,
        advanced_gate: undefined,
        advanced_nodes: undefined,
      });
      delete row.last_pause_apply_id;
      delete row.last_pause_location;
      delete row.last_resume_apply_id;
      delete row.last_close_apply_id;
      data[key] = row;
      console.log(`OK ${key} project_id=${projectId}`);
    }
  });

  data.CFG01 = { ...(data.EM01 || {}), kind: 'CFG01' };
  persist(data, '由 scripts/prepare-4834.js 生成（页面建项+打节点态）');
  return data;
}

async function phaseApprove(_unused, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'ui';
  const who = auditorForLocation(1) || superAdmin();

  for (const key of keys) {
    const row = data[key] || {};
    const pid = String(row.project_id || '').trim();
    if (!pid) {
      console.log(`skip ${key}: 无 project_id`);
      continue;
    }
    const nav = await readNav(pid);
    const basic = nav['基本信息'];
    const st = basic != null ? Number(basic.status) : null;
    if (st === 2 || st === 21) {
      console.log(`跳过基本信息审批 ${key}=${pid}（已通过，状态码 ${st}）`);
      row.basic_approved = true;
      data[key] = row;
      continue;
    }
    if (row.basic_approved && st !== 2 && st !== 21) {
      console.log(
        `忽略残留 basic_approved：${key}=${pid} 当前基本信息状态=${st}（${st === 88 ? '排队中' : '非通过'}），继续审批`,
      );
      row.basic_approved = false;
    }
    console.log(`审批基本信息(页面) ${key}=${pid} 审核人=${who} 当前状态=${st}`);
    await withBrowser('admin', who, async ({ page }) => {
      await approveNodeUi(page, pid, '基本信息', {
        approvalResult: '审批通过',
        remark: '4834造数-基本信息通过',
      });
    });
    row.basic_approved = true;
    data[key] = row;
  }

  persist(data, '由 scripts/prepare-4834.js 生成（页面建项+打节点态）');
}

async function phaseShape(_unused, { only } = {}) {
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'ui';
  const stats = { ok: 0, skip: 0, fail: 0, rows: [] };

  for (const key of keys) {
    const spec = SPECS[key];
    const row = data[key] || {};
    const pid = String(row.project_id || '').trim();
    if (!pid) {
      console.log(`跳过 ${key}：无项目编号`);
      stats.skip += 1;
      stats.rows.push(`${key} 跳过（无项目编号）`);
      continue;
    }
    let nav = await readNav(pid);
    const focus = resolveFocusNode(row.pause_ok_node || row.paused_node || '');
    const avoid =
      key === 'EM02' && data.EM01 && data.EM01.pause_ok_node
        ? String(data.EM01.pause_ok_node)
        : '';
    let target = focus && nav[focus] ? focus : null;
    if (!target) {
      const open = firstOpenSecurityNode(nav);
      if (avoid && open === avoid) {
        const alt = Object.keys(nav).find(
          (n) => n !== avoid && n !== '基本信息' && n !== '终审' && canPauseStatus(nav[n].status),
        );
        target = alt || open;
      } else {
        target = open;
      }
    }
    if (!target) target = focus || '架构审核';
    const [loc] = NODE_LOCATION[target] || [2, 0];
    const who = auditorForLocation(loc) || superAdmin();
    const shape = String(spec.shape || '');
    const doSacrifice =
      shape === 'exempt_then_pause_ok' || (shape === 'pause_ok' && sacrificeLeftEnabled());
    console.log(
      `${key} 打节点态=${shape}${doSacrifice ? '+sacrifice' : ''} 目标节点=${target} 审核人=${who}`,
    );

    try {
      let skipped = false;
      await withBrowser('admin', who, async ({ page }) => {
        if (shape === 'pause_ok' || shape === 'exempt_then_pause_ok') {
          if (doSacrifice) {
            const st = nav[target] != null ? Number(nav[target].status) : null;
            if (st === 101 || st === 102 || st === 2 || st === 21) {
              console.log(`  ${target} 已是终态 status=${st}，不再免审，直接找下一可暂停节点`);
            } else if (st === 11) {
              console.log(`  ${target} 已关闭，跳过`);
              skipped = true;
              return;
            } else {
              console.log(
                `  ⚠ 牺牲左侧：免审「${target}」（终态不可逆，仅 PREPARE_SACRIFICE_LEFT / exempt_then_pause_ok）`,
              );
              await approveNodeUi(page, pid, target, {
                approvalResult: '免审',
                remark: '4834造数-免审(sacrifice)',
              });
              row.exempt_node = target;
            }
          } else {
            console.log(`  保留中间态：不免审，只标记可申请暂停节点`);
          }
        } else if (shape === 'paused') {
          const st = nav[target] != null ? Number(nav[target].status) : null;
          if (st === 99) {
            console.log(`  ${target} 已是审核暂停，跳过再置暂停`);
            row.paused_node = target;
          } else if (st === 11 || st === 2 || st === 21 || st === 101 || st === 102 || st === 100) {
            console.log(`  ${target} 已终态 status=${st}，无法再置暂停 → 跳过`);
            skipped = true;
            return;
          } else {
            await approveNodeUi(page, pid, target, {
              approvalResult: '审核暂停',
              remark: '4834造数-审核暂停',
            });
            row.paused_node = target;
          }
          const [ploc, sa] = NODE_LOCATION[row.paused_node || target] || [2, 0];
          row.paused_location = ploc;
          row.paused_second_audit = sa;
        }
      });

      if (!skipped && (shape === 'pause_ok' || shape === 'exempt_then_pause_ok')) {
        nav = await readNav(pid);
        const pauseNode =
          (focus && nav[focus] && canPauseStatus(nav[focus].status) && focus) ||
          firstOpenSecurityNode(nav);
        row.pause_ok_node = pauseNode || null;
        if (pauseNode) {
          const [ploc, sa] = NODE_LOCATION[pauseNode] || [null, 0];
          row.pause_ok_location = ploc;
          row.pause_ok_second_audit = sa;
        } else {
          row.pause_ok_location = null;
          row.pause_ok_second_audit = 0;
        }
      }

      const navFinal = await readNav(pid);
      row.nav = dumpNav(navFinal);
      applyNodeRoles(row, navFinal);
      const finalRow = navFinal['终审'] || navFinal['项目终审'];
      row.final_status = finalRow ? finalRow.status : null;
      row.final_location = 10;
      data[key] = row;

      if (skipped) {
        stats.skip += 1;
        stats.rows.push(`${key} 跳过（目标节点已终态，无法打态）`);
        console.log(`跳过 ${key}`);
      } else if (
        (shape === 'pause_ok' || shape === 'exempt_then_pause_ok') &&
        !row.pause_ok_node
      ) {
        stats.skip += 1;
        stats.rows.push(`${key} 未找到可申请暂停节点（闸道未开或焦点不可用；勿盲目 sacrifice）`);
        console.log(`跳过 ${key}：无可申请暂停节点`);
      } else {
        stats.ok += 1;
        const tip =
          shape === 'paused'
            ? `已暂停节点=${row.paused_node || '无'}`
            : `可申请暂停节点=${row.pause_ok_node || '无'}${row.exempt_node ? `（已牺牲=${row.exempt_node}）` : ''}`;
        stats.rows.push(`${key} 成功：${tip}`);
        console.log(`成功 ${key} ${tip}`);
      }
    } catch (e) {
      stats.fail += 1;
      stats.rows.push(`${key} 失败：${String(e.message || e).slice(0, 120)}`);
      throw e;
    }
  }

  if (data.EM01) {
    data.CFG01 = { ...data.EM01, kind: 'CFG01' };
  }
  persist(data, '由 scripts/prepare-4834.js 生成（页面建项+打节点态）');
  return stats;
}

function canPauseStatus(st) {
  const n = Number(st);
  return ![103, 101, 102, 2, 21, 99, 11, 100].includes(n);
}

async function phaseAdvance(_unused, { only, advanceGate = 'g1' } = {}) {
  const gateKey = String(advanceGate || 'g1').toLowerCase();
  const gate = NODE_GATES[gateKey];
  if (!gate) throw new Error(`未知 --advance-gate=${advanceGate}，可选 ${Object.keys(NODE_GATES).join('|')}`);
  const keys = only ? [only] : Object.keys(SPECS);
  const data = loadData();
  data.prepare_via = 'ui';
  const stats = { ok: 0, skip: 0, fail: 0, rows: [] };

  for (const key of keys) {
    const row = data[key] || {};
    const pid = String(row.project_id || '').trim();
    if (!pid) {
      console.log(`跳过 ${key}：无项目编号`);
      stats.skip += 1;
      stats.rows.push(`${key} 跳过（无项目编号）`);
      continue;
    }
    console.log(`\n===== ${key}=${pid} 推进闸道 ${gate.id}：${gate.nodes.join('、')} =====`);
    const advanced = [];
    let skippedNodes = 0;
    for (const nodeName of gate.nodes) {
      const nav = await readNav(pid);
      const cur = nav[nodeName];
      const st = cur != null ? Number(cur.status) : null;
      if (st == null) {
        console.log(`  跳过 ${nodeName}：导航无此节点`);
        skippedNodes += 1;
        continue;
      }
      if (GATE_DONE.has(st)) {
        console.log(`  跳过 ${nodeName}：已终态（状态码 ${st}）`);
        skippedNodes += 1;
        continue;
      }
      if (st === ST_NOT_OPEN) {
        console.log(`  跳过 ${nodeName}：未开启，需上一闸先过`);
        skippedNodes += 1;
        continue;
      }
      const [loc] = NODE_LOCATION[nodeName] || [];
      const who = auditorForLocation(loc) || superAdmin();
      await withBrowser('admin', who, async ({ page }) => {
        if (st === ST_PAUSE) {
          console.log(`  ${nodeName}：暂停 → 审核重启 → 免审（审核人 ${who}）`);
          try {
            await approveNodeUi(page, pid, nodeName, {
              approvalResult: '审核重启',
              remark: '4834推进闸道-审核重启',
            });
          } catch (e) {
            console.log(`  ${nodeName} 审核重启失败，尝试直接免审：${String(e.message || e).slice(0, 80)}`);
          }
        }
        console.log(`  ${nodeName}：→ 免审（审核人 ${who}）`);
        await approveNodeUi(page, pid, nodeName, {
          approvalResult: '免审',
          remark: `4834推进闸道-${gate.id}-免审`,
        });
      });
      advanced.push(nodeName);
    }
    const navFinal = await readNav(pid);
    row.nav = dumpNav(navFinal);
    applyNodeRoles(row, navFinal);
    row.advanced_gate = gate.id;
    row.advanced_nodes = advanced;
    data[key] = row;
    if (advanced.length) {
      stats.ok += 1;
      stats.rows.push(
        `${key} 成功推进 ${advanced.length} 个节点：${advanced.join('、')}（另跳过 ${skippedNodes} 个）`,
      );
      console.log(`成功 ${key}：已推进 ${advanced.join('、')}`);
    } else {
      stats.skip += 1;
      stats.rows.push(`${key} 全部跳过（本闸 ${skippedNodes} 个节点已终态/未开启）`);
      console.log(`跳过 ${key}：本闸无节点可推进`);
    }
  }

  if (data.EM01) data.CFG01 = { ...data.EM01, kind: 'CFG01' };
  persist(data, '由 scripts/prepare-4834.js 推进闸道（旧项目复用）');
  return stats;
}

module.exports = { phaseCreate, phaseApprove, phaseShape, phaseAdvance };
