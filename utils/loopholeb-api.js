/**
 * 渗透漏洞 loopholeb API — 对齐 AT_py cases/4869/api/loopholeb_api.py
 * 造洞：copyLoopholeb → PUT 改 projectId → batchInsert（直接 POST 常校验失败）
 */
const { API_BASE_URL, env } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');

const LOOPHOLE_STATUS = {
  待修复: 1,
  遗留: 2,
  已修复: 3,
  已忽略: 5,
  待复测: 8,
  待评估: 99,
  已接受: 16,
  遗留评估: 99,
};

/** 风险等级 → hazardGrade / hazardGradeRisk（HazardGraderLongEnum） */
const LEVEL_GRADE = {
  提示: 0,
  低危: 1,
  中危: 2,
  高危: 3,
  严重: 4,
  红线: 5,
  不合规: 6,
};

const MATRIX_FILL_STATUSES = ['待评估', '待复测', '遗留', '已接受', '已忽略'];

function createClient(request, token) {
  const headers = authHeaders(token);
  async function getJson(url, options = {}) {
    const response = await request.get(url, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      ignoreHTTPSErrors: true,
    });
    const body = await response.json().catch(() => ({}));
    if (body && typeof body === 'object') body._http = response.status();
    return body;
  }
  async function postJson(url, data) {
    const response = await request.post(url, {
      data,
      headers,
      ignoreHTTPSErrors: true,
    });
    const body = await response.json().catch(() => ({}));
    if (body && typeof body === 'object') body._http = response.status();
    return body;
  }
  async function putJson(url, data) {
    const response = await request.put(url, {
      data,
      headers,
      ignoreHTTPSErrors: true,
    });
    const body = await response.json().catch(() => ({}));
    if (body && typeof body === 'object') body._http = response.status();
    return body;
  }
  return { getJson, postJson, putJson };
}

function extractRows(body) {
  let rows = body.rows;
  if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    rows = body.data.rows;
  }
  if (rows == null && Array.isArray(body.data)) rows = body.data;
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
}

function inferLevel(row) {
  const hg = Number(row.hazardGrade);
  const hgr = Number(row.hazardGradeRisk);
  if (Number.isNaN(hg) && Number.isNaN(hgr)) return '未知';
  if (hgr === 0 || hg === 0) return '提示';
  if (hgr === 1 || hg === 1) return '低危';
  if (hgr === 2 || hg === 2) return '中危';
  if (hgr === 3 || hg === 3) return '高危';
  if (hgr === 4 || hg === 4) return '严重';
  if (hgr === 5 || hg === 5) return '红线';
  if (hgr === 6 || hg === 6) return '不合规';
  return '未知';
}

async function resolveTemplateVulnId(api) {
  const fromEnv = env('PSRB_TEMPLATE_VULN_ID');
  if (fromEnv) return Number(fromEnv);
  const body = await api._getJson(`${API_BASE_URL}/loophole/loopholeb/list`, {
    params: { pageNum: 1, pageSize: 1 },
  });
  const row = extractRows(body)[0];
  if (!row?.id) throw new Error('无可用模板漏洞，请设 PSRB_TEMPLATE_VULN_ID');
  return Number(row.id);
}

async function loopholebApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
  const { getJson, postJson, putJson } = createClient(request, token);
  const listPaths = [`${API_BASE_URL}/loophole/loopholeb/list`, `${API_BASE_URL}/loopholeb/list`];

  const api = {
    _getJson: getJson,

    async listVulns(projectId, { pageSize = 50 } = {}) {
      const all = [];
      let page = 1;
      let last = '';
      while (page <= 40) {
        let body = null;
        for (const url of listPaths) {
          body = await getJson(url, {
            params: { projectId: Number(projectId), pageNum: page, pageSize },
          });
          if (codeOk(body)) break;
          last = `${url} ${msgOf(body)}`;
          body = null;
        }
        if (!body) {
          if (all.length) break;
          throw new Error(`listVulns 失败: ${last}`);
        }
        const batch = extractRows(body);
        all.push(...batch);
        const total = body.total != null ? Number(body.total) : null;
        if (!batch.length) break;
        if (total != null && all.length >= total) break;
        if (batch.length < pageSize) break;
        page += 1;
      }
      return all;
    },

    async get(vulnId) {
      const paths = [
        `${API_BASE_URL}/loophole/loopholeb/${vulnId}`,
        `${API_BASE_URL}/loopholeb/${vulnId}`,
      ];
      let last = '';
      for (const url of paths) {
        const body = await getJson(url);
        if (codeOk(body) && body.data && typeof body.data === 'object') return body.data;
        last = `${url} ${msgOf(body)}`;
      }
      throw new Error(`get vuln 失败: ${last}`);
    },

    async setStatus(vulnId, statusLabel, { repairTime } = {}) {
      const code = LOOPHOLE_STATUS[statusLabel];
      if (code == null) throw new Error(`未知状态 ${statusLabel}`);
      const detail = await this.get(vulnId);
      const payload = {
        id: Number(vulnId),
        projectId: detail.projectId,
        name: detail.name,
        status: Number(code),
        hasProject: detail.hasProject || 1,
        productId: detail.productId,
        typeId: detail.typeId,
        hazardGrade: detail.hazardGrade,
        hazardGradeRisk: detail.hazardGradeRisk,
        source: detail.source,
        riskInterface: detail.riskInterface,
        content: detail.content,
        explain: detail.explain,
        proposal: detail.proposal,
      };
      if (statusLabel === '已修复') {
        payload.repairTime =
          repairTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
      const body = await putJson(`${API_BASE_URL}/loophole/loopholeb`, payload);
      if (!codeOk(body)) {
        return { ok: false, id: Number(vulnId), status: statusLabel, err: msgOf(body) };
      }
      return { ok: true, id: Number(vulnId), status: statusLabel, code };
    },

    /**
     * 按 plan [(level|null, status), ...] 改状态；默认先重置待修复。
     */
    async applyStatusPlan(projectId, plan, { reset = true } = {}) {
      let rows = await this.listVulns(projectId);
      if (reset && rows.length) {
        for (const r of rows) {
          try {
            await this.setStatus(Number(r.id), '待修复');
          } catch {
            /* ignore */
          }
        }
        rows = await this.listVulns(projectId);
      }
      const defaultCodes = new Set([LOOPHOLE_STATUS['待修复'], LOOPHOLE_STATUS['待评估']]);
      let pool = rows.filter((r) => defaultCodes.has(Number(r.status)));
      if (!pool.length) pool = [...rows];

      let workPlan = [...plan];
      if (pool.length < workPlan.length) {
        const compressed = [];
        const seen = new Set();
        for (const [level, st] of workPlan) {
          if (!seen.has(st)) {
            compressed.push([level, st]);
            seen.add(st);
          }
        }
        for (const item of workPlan) {
          if (compressed.length >= pool.length) break;
          if (!compressed.some((c) => c[0] === item[0] && c[1] === item[1])) {
            compressed.push(item);
          }
        }
        workPlan = compressed.slice(0, pool.length);
      }

      const used = new Set();
      const detail = [];
      for (const [level, st] of workPlan) {
        let cand = null;
        for (const r of pool) {
          const rid = Number(r.id);
          if (used.has(rid)) continue;
          if (level) {
            const lv = inferLevel(r);
            const aliases = new Set([level]);
            if (level === '红线' || level === '不合规') {
              aliases.add('红线');
              aliases.add('不合规');
              aliases.add('提示');
            }
            if (lv !== '未知' && !aliases.has(lv)) continue;
          }
          cand = r;
          break;
        }
        if (!cand) {
          cand = pool.find((r) => !used.has(Number(r.id))) || null;
        }
        if (!cand) {
          detail.push({ level, status: st, ok: false, err: 'no_candidate' });
          continue;
        }
        const rid = Number(cand.id);
        const res = await this.setStatus(rid, st);
        if (res.ok) used.add(rid);
        detail.push({
          level,
          status: st,
          ok: !!res.ok,
          id: rid,
          infer_level: inferLevel(cand),
          err: res.err,
        });
      }
      const okN = detail.filter((x) => x.ok).length;
      return {
        via: 'api_put_loopholeb',
        total: workPlan.length,
        ok: okN,
        pool: pool.length,
        listed: rows.length,
        reset,
        detail,
      };
    },

    /**
     * 复制模板正式漏洞 → 草稿 → 改挂目标项目 → 批量提交正式洞
     * @param {Array<{level:string,status?:string,name?:string}>} specs
     */
    async createVulnsOnProject(projectId, specs, { templateVulnId } = {}) {
      const tplId = templateVulnId || (await resolveTemplateVulnId(this));
      const projBody = await getJson(
        `${API_BASE_URL}/detectionprojects/detectionProjectsBase/${Number(projectId)}`,
      );
      if (!codeOk(projBody) || !projBody.data) {
        throw new Error(`读项目 ${projectId} 失败: ${msgOf(projBody)}`);
      }
      const proj = projBody.data;
      const sbom = (proj.sbomList || [])[0] || {};
      const created = [];
      const noteIds = [];

      for (const spec of specs) {
        const level = spec.level || '中危';
        const grade = LEVEL_GRADE[level];
        if (grade == null) throw new Error(`未知等级 ${level}`);
        const ts = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const name =
          spec.name ||
          `4869-VULN-渗透-${spec.status || '待评估'}-${level}-${ts}`;
        const copyBody = await postJson(`${API_BASE_URL}/loophole/loopholebNote/copyLoopholeb`, {
          id: Number(tplId),
          name,
          content: `<p>c-${name}</p>`,
          explain: `<p>e-${name}</p>`,
          proposal: `<p>p-${name}</p>`,
          riskInterface: `${name}-if`,
          hazardGrade: grade,
          hazardGradeRisk: grade,
        });
        if (!codeOk(copyBody)) {
          throw new Error(`copyLoopholeb 失败 ${name}: ${msgOf(copyBody)}`);
        }

        const listBody = await getJson(`${API_BASE_URL}/loophole/loopholebNote/list`, {
          params: { pageNum: 1, pageSize: 20, name },
        });
        const note =
          extractRows(listBody).find((r) => r.name === name) || extractRows(listBody)[0];
        if (!note?.id) throw new Error(`copy 后找不到草稿 ${name}`);

        const detailBody = await getJson(`${API_BASE_URL}/loophole/loopholebNote/${note.id}`);
        const body = (detailBody.data && typeof detailBody.data === 'object' ? detailBody.data : note);
        body.projectId = Number(projectId);
        body.productId = proj.productId || proj.departmentId;
        body.packageName = sbom.name || body.packageName;
        body.productType = 3;
        body.hazardGrade = grade;
        body.hazardGradeRisk = grade;
        body.name = name;
        body.content = `<p>c-${name}</p>`;
        body.explain = `<p>e-${name}</p>`;
        body.proposal = `<p>p-${name}</p>`;
        body.riskInterface = `${name}-if`;

        const up = await putJson(`${API_BASE_URL}/loophole/loopholebNote`, body);
        if (!codeOk(up)) {
          throw new Error(`改挂项目失败 ${name}: ${msgOf(up)}`);
        }
        noteIds.push(Number(note.id));
        created.push({
          note_id: Number(note.id),
          name,
          level,
          status: spec.status || null,
        });
      }

      if (noteIds.length) {
        const bi = await postJson(`${API_BASE_URL}/loophole/loopholebNote/batchInsert`, {
          loopholeIds: noteIds,
        });
        if (!codeOk(bi)) {
          throw new Error(`batchInsert 失败: ${msgOf(bi)}`);
        }
      }

      const vulns = await this.listVulns(projectId);
      for (const c of created) {
        const hit = vulns.find((v) => v.name === c.name);
        if (hit) c.vuln_id = Number(hit.id);
      }
      return { templateVulnId: tplId, created, listed: vulns.length };
    },
  };

  return api;
}

function buildStatusPlan({ levels, statuses } = {}) {
  const lv = levels || ['提示', '低危', '中危', '高危', '严重'];
  const st = statuses || MATRIX_FILL_STATUSES;
  /** 压缩：每种状态 1 条 + 尽量覆盖等级 */
  const plan = [];
  for (let i = 0; i < st.length; i += 1) {
    plan.push([lv[i % lv.length], st[i]]);
  }
  return plan;
}

function buildVulnCreateSpecs(plan) {
  return plan.map(([level, status]) => ({ level, status }));
}

module.exports = {
  LOOPHOLE_STATUS,
  LEVEL_GRADE,
  MATRIX_FILL_STATUSES,
  inferLevel,
  buildStatusPlan,
  buildVulnCreateSpecs,
  loopholebApiAs,
};
