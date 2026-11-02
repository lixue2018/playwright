/**
 * 威胁 threaten API — 创建 + 列表 + frontBatchAudit 改状态
 * 对齐 AT_py threaten_api + POST /loophole/threaten（已在 216 验证）
 */
const { API_BASE_URL, env } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');

const THREAT_STATUS = {
  待修复: 1,
  遗留: 2,
  已修复: 3,
  已忽略: 5,
  待复测: 8,
  已接受: 16,
  待评估: 99,
  遗留评估: 99,
};

const LEVEL_GRADE = {
  提示: 0,
  低危: 1,
  中危: 2,
  高危: 3,
  严重: 4,
  红线: 5,
  不合规: 6,
};

/** 节点 → location / boundary（threatenDetail） */
const NODE_META = {
  架构审核: { location: 2, boundary: 'frame' },
  数据安全: { location: 23, boundary: 'datasafe' },
  隐私安全: { location: 3, boundary: 'privacy' },
};

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
  return { getJson, postJson, headers };
}

function extractRows(body) {
  let rows = body.rows;
  if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    rows = body.data.rows;
  }
  if (rows == null && Array.isArray(body.data)) rows = body.data;
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
}

async function threatenApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
  const { getJson, postJson } = createClient(request, token);

  const api = {
    async listThreats(projectId, { pageSize = 100 } = {}) {
      const all = [];
      let page = 1;
      while (page <= 30) {
        const body = await getJson(`${API_BASE_URL}/loophole/threaten/list`, {
          params: { projectId: Number(projectId), pageNum: page, pageSize },
        });
        if (!codeOk(body) && !extractRows(body).length) {
          if (all.length) break;
          throw new Error(`listThreats 失败: ${msgOf(body)}`);
        }
        const batch = extractRows(body);
        all.push(...batch);
        if (batch.length < pageSize) break;
        page += 1;
      }
      return all;
    },

    async batchAudit(ids, statusLabel, { projectId, message } = {}) {
      const status = THREAT_STATUS[statusLabel];
      if (status == null) throw new Error(`未知威胁状态 ${statusLabel}`);
      const msg = message || env('PSRB_THREAT_AUDIT_MSG', '4869-js改状态');
      const payload = {
        ids: ids.map(Number),
        status: Number(status),
        contentMessage: msg,
        content: msg,
        message: msg,
        mark: String(msg).slice(0, 40),
      };
      if (projectId != null) payload.projectId = Number(projectId);
      const paths = [
        `${API_BASE_URL}/loophole/threaten/frontBatchAudit`,
        `${API_BASE_URL}/loophole/threaten/batchAudit`,
      ];
      let last = '';
      for (const url of paths) {
        const body = await postJson(url, payload);
        if (codeOk(body)) return { ok: true, path: url, body };
        last = `${url} ${msgOf(body)}`;
      }
      return { ok: false, error: last };
    },

    /**
     * @param {string|number} projectId
     * @param {Array<{name?:string,level:string,status?:string,node?:string}>} specs
     */
    async createThreats(projectId, specs) {
      const projBody = await getJson(
        `${API_BASE_URL}/detectionprojects/detectionProjectsBase/${Number(projectId)}`,
      );
      if (!codeOk(projBody) || !projBody.data) {
        throw new Error(`读项目失败: ${msgOf(projBody)}`);
      }
      const proj = projBody.data;
      const productId = proj.productId || proj.departmentId;
      const created = [];

      for (const spec of specs) {
        const level = spec.level || '中危';
        const grade = LEVEL_GRADE[level];
        if (grade == null) throw new Error(`未知等级 ${level}`);
        const node = spec.node || '架构审核';
        const meta = NODE_META[node] || NODE_META['架构审核'];
        const ts = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const name = spec.name || `4869-THREAT-${node}-${spec.status || '待评估'}-${level}-${ts}`;
        const payload = {
          projectId: Number(projectId),
          name,
          threatType: level === '不合规' ? 2 : 1,
          boundary: meta.boundary,
          location: meta.location,
          hazardGrade: grade,
          hazardGradeRisk: grade,
          status: 1,
          typeId: 1,
          typeName: '协议安全模块',
          productId: Number(productId),
          hasProject: 1,
          source: 1,
          potentialLosses: 0,
          repeatability: 0,
          utilizability: 0,
          affectedUsers: '0',
          discoverability: 0,
          hazardScore: String(Math.max(1, grade * 2 + 1)),
          explain: `<p>e-${name}</p>`,
          content: `<p>c-${name}</p>`,
          proposal: `<p>p-${name}</p>`,
        };
        const body = await postJson(`${API_BASE_URL}/loophole/threaten`, payload);
        if (!codeOk(body)) {
          throw new Error(`createThreat ${name}: ${msgOf(body)}`);
        }
        created.push({ name, level, status: spec.status || null, node });
      }

      const listed = await this.listThreats(projectId);
      for (const c of created) {
        const hit = listed.find((r) => r.name === c.name);
        if (hit) c.threat_id = Number(hit.id);
      }
      return { created, listed: listed.length };
    },

    /** plan: [[level|null, status], ...] */
    async applyStatusPlan(projectId, plan) {
      const rows = await this.listThreats(projectId);
      const detail = [];
      const used = new Set();
      for (const [level, st] of plan) {
        let cand = null;
        for (const r of rows) {
          const rid = Number(r.id);
          if (used.has(rid)) continue;
          if (level) {
            const hg = Number(r.hazardGrade);
            const want = LEVEL_GRADE[level];
            if (want != null && !Number.isNaN(hg) && hg !== want) continue;
          }
          cand = r;
          break;
        }
        if (!cand) cand = rows.find((r) => !used.has(Number(r.id))) || null;
        if (!cand) {
          detail.push({ level, status: st, ok: false, err: 'no_candidate' });
          continue;
        }
        const rid = Number(cand.id);
        const res = await this.batchAudit([rid], st, { projectId });
        if (res.ok) used.add(rid);
        detail.push({ level, status: st, ok: !!res.ok, id: rid, err: res.error });
      }
      return {
        via: 'threaten_frontBatchAudit',
        total: plan.length,
        ok: detail.filter((d) => d.ok).length,
        detail,
      };
    },
  };

  return api;
}

function buildThreatSpecs({ nodes, levels, statuses, each = 1 } = {}) {
  const ns = nodes || ['架构审核', '数据安全', '隐私安全'];
  const lv = levels || ['提示', '低危', '中危', '高危', '严重'];
  const st = statuses || ['待评估', '待复测', '待修复', '遗留', '已接受', '已忽略'];
  const specs = [];
  let i = 0;
  for (const node of ns) {
    const nodeLevels =
      node === '架构审核' ? lv.filter((x) => x !== '不合规' && x !== '红线') : [...lv];
    for (const level of nodeLevels) {
      for (let n = 0; n < each; n += 1) {
        specs.push({
          node,
          level,
          status: st[i % st.length],
        });
        i += 1;
      }
    }
  }
  return specs;
}

module.exports = {
  THREAT_STATUS,
  LEVEL_GRADE,
  NODE_META,
  threatenApiAs,
  buildThreatSpecs,
};
