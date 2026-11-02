const { loadFixture, patchFixture } = require('./env');
const { frontOwner, auditorForLocation, nodeNameOf, nodePairByLocation, superAdmin } = require('./accounts');
const { nodeApplyApiAs } = require('./node-apply-api');
const {
  NODE_LOCATION,
  canPause,
  codeOk,
  msgOf,
  locPauseOk,
  locPaused,
  ST_PAUSE,
  ST_CLOSED,
} = require('./rules');

async function ensurePausePending(request, projectKey = 'EM01') {
  const fixture = loadFixture();
  const row = fixture[projectKey];
  const pid = Number(row.project_id);
  const api = await nodeApplyApiAs(request, frontOwner());
  let [loc, sa] = locPauseOk(row);
  let cur = await api.currentData(pid, loc, sa);
  const pending = cur.pendingApply || {};
  if (pending.id && [1, '1'].includes(pending.applyType)) {
    return { pid, loc, sa, applyId: Number(pending.id) };
  }

  // 其他节点可能已有暂停 pending（冒烟/前序用例留下）
  for (const [name, pair] of Object.entries(NODE_LOCATION)) {
    if (name === '基本信息' || name === '终审') continue;
    if (pair[0] === loc && pair[1] === sa) continue;
    const other = await api.currentData(pid, pair[0], pair[1]);
    const p = other.pendingApply || {};
    if (p.id && [1, '1'].includes(p.applyType)) {
      patchFixture(projectKey, { last_pause_apply_id: p.id, last_pause_location: pair[0] });
      return { pid, loc: pair[0], sa: pair[1], applyId: Number(p.id) };
    }
  }

  if (cur.currentReviewStatus === ST_PAUSE || !cur.canApplyPause) {
    const found = await pickApplyablePause(api, pid, [loc, sa]);
    loc = found.loc;
    sa = found.sa;
    cur = found.cur;
  }
  const body = await api.pause(pid, loc, { secondAudit: sa });
  if (!codeOk(body)) {
    throw new Error(`补造暂停申请失败 ${JSON.stringify(body).slice(0, 300)}`);
  }
  const after = await api.currentData(pid, loc, sa);
  const applyId = (after.pendingApply || {}).id;
  if (!applyId) throw new Error(`补造暂停后无 pending ${JSON.stringify(after).slice(0, 300)}`);
  patchFixture(projectKey, { last_pause_apply_id: applyId, last_pause_location: loc });
  return { pid, loc, sa, applyId: Number(applyId) };
}

async function pickApplyablePause(api, projectId, preferred) {
  const candidates = [];
  if (preferred) candidates.push(preferred);
  for (const [name, pair] of Object.entries(NODE_LOCATION)) {
    if (name === '基本信息' || name === '终审') continue;
    if (!candidates.some(([l, s]) => l === pair[0] && s === pair[1])) candidates.push(pair);
  }
  for (const [loc, sa] of candidates) {
    const cur = await api.currentData(projectId, loc, sa);
    if (cur.pendingApply) continue;
    if (cur.canApplyPause || (cur.showApplyPause && canPause(cur.currentReviewStatus))) {
      if (cur.canApplyPause) return { loc, sa, cur };
    }
  }
  throw new Error(`项目 ${projectId} 无可用可申请暂停节点，请重新造数`);
}

async function tryPickApplyablePause(api, projectId, preferred) {
  try {
    return await pickApplyablePause(api, projectId, preferred);
  } catch {
    return null;
  }
}

async function ensureResumePending(request, projectKey = 'EM02') {
  const fixture = loadFixture();
  const row = fixture[projectKey];
  const pid = Number(row.project_id);
  const [loc, sa] = locPaused(row);
  const api = await nodeApplyApiAs(request, frontOwner());
  const cur = await api.currentData(pid, loc, sa);
  const pending = cur.pendingApply || {};
  if (pending.id && [2, '2'].includes(pending.applyType)) {
    return { pid, loc, sa, applyId: Number(pending.id), skipped: false };
  }
  if (![ST_PAUSE, 99].includes(cur.currentReviewStatus)) {
    return { skip: `节点非审核暂停 status=${cur.currentReviewStatus}` };
  }
  if (pending.id) {
    return { skip: `已有非恢复 pending applyType=${pending.applyType}` };
  }
  const body = await api.resume(pid, loc, sa);
  if (!codeOk(body)) throw new Error(`补造恢复失败 ${JSON.stringify(body).slice(0, 300)}`);
  const after = await api.currentData(pid, loc, sa);
  const applyId = (after.pendingApply || {}).id;
  if (!applyId) throw new Error('补造恢复后无 pending');
  patchFixture(projectKey, { last_resume_apply_id: applyId });
  return { pid, loc, sa, applyId: Number(applyId) };
}

async function ensureClosePending(request, projectKey = 'EM02') {
  const fixture = loadFixture();
  const row = fixture[projectKey];
  const pid = Number(row.project_id);
  const api = await nodeApplyApiAs(request, frontOwner());
  const cur = await api.currentData(pid, 10, 0);
  const pending = cur.pendingApply || {};
  if (pending.id && [3, '3'].includes(pending.applyType)) {
    return { pid, loc: 10, sa: 0, applyId: Number(pending.id) };
  }
  if ([ST_CLOSED, 11].includes(cur.currentReviewStatus)) {
    return { skip: `${projectKey} 终审已关闭，无法再申请关闭` };
  }
  if (pending.id) {
    return { skip: `${projectKey} 终审已有其他 pending` };
  }
  if (!cur.canApplyClose && !cur.showApplyClose) {
    return { skip: `${projectKey} 终审不可申请关闭` };
  }
  const body = await api.close(pid, { reason: '<p>4834-QA-申请理由</p>' });
  if (!codeOk(body)) {
    throw new Error(`补造关闭申请失败 ${JSON.stringify(body).slice(0, 300)}`);
  }
  const after = await api.currentData(pid, 10, 0);
  const applyId = (after.pendingApply || {}).id;
  if (!applyId) throw new Error(`补造关闭后无 pending ${JSON.stringify(after).slice(0, 300)}`);
  patchFixture(projectKey, { last_close_apply_id: applyId });
  return { pid, loc: 10, sa: 0, applyId: Number(applyId) };
}

async function tryNodeApplyAs(request, itCode) {
  if (!itCode) return null;
  try {
    const api = await nodeApplyApiAs(request, itCode);
    return { api, itCode };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/登录失败|不存在/.test(msg)) return null;
    throw err;
  }
}

function auditorCandidates(loc) {
  const [a, b] = nodePairByLocation(loc);
  return [...new Set([a, b, superAdmin()].filter(Boolean))];
}

async function auditorApiFor(request, loc) {
  for (const who of auditorCandidates(loc)) {
    const hit = await tryNodeApplyAs(request, who);
    if (hit) return hit;
  }
  throw new Error(`location=${loc} 主审/Backup/超管均无法登录`);
}

/** 依次尝试主审/Backup/超管 audit 通过 */
async function auditPassWithFallback(request, { applyId, pid, loc, sa = 0, expectNotIn = null } = {}) {
  let lastErr = '';
  for (const who of auditorCandidates(loc)) {
    const hit = await tryNodeApplyAs(request, who);
    if (!hit) continue;
    const body = await hit.api.audit(applyId, true);
    if (!codeOk(body)) {
      lastErr = `${who}: ${msgOf(body)}`;
      continue;
    }
    const after = await hit.api.currentData(pid, loc, sa);
    if (expectNotIn && expectNotIn.includes(after.currentReviewStatus)) {
      throw new Error(`审核通过后状态仍在禁集 ${after.currentReviewStatus}`);
    }
    return { pid, loc, sa, after, itCode: who };
  }
  throw new Error(`审核通过失败 ${lastErr || `location=${loc} 无人可审`}`);
}

module.exports = {
  ensurePausePending,
  ensureResumePending,
  ensureClosePending,
  pickApplyablePause,
  tryPickApplyablePause,
  tryNodeApplyAs,
  auditorCandidates,
  auditorApiFor,
  auditPassWithFallback,
  locPauseOk,
  locPaused,
  auditorForLocation,
  nodeNameOf,
};
