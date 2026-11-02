/**
 * AI 安全 — complianceNote 草稿 + batchInsert 正式
 */
const { API_BASE_URL } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');
const { LEVEL_GRADE } = require('./loopholeb-api');

function extractRows(body) {
  let rows = body.rows;
  if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    rows = body.data.rows;
  }
  if (rows == null && Array.isArray(body.data)) rows = body.data;
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
}

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

async function aiComplianceApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
  const { getJson, postJson, putJson } = createClient(request, token);

  return {
    async listNotes(projectId, { pageSize = 50 } = {}) {
      const body = await getJson(`${API_BASE_URL}/loophole/complianceNote/list`, {
        params: { projectId: Number(projectId), pageNum: 1, pageSize },
      });
      return extractRows(body);
    },

    async listOfficial(projectId, { pageSize = 50 } = {}) {
      const body = await getJson(`${API_BASE_URL}/loophole/compliance/list`, {
        params: { projectId: Number(projectId), pageNum: 1, pageSize },
      });
      return extractRows(body);
    },

    async createNotes(projectId, specs) {
      const projBody = await getJson(
        `${API_BASE_URL}/detectionprojects/detectionProjectsBase/${Number(projectId)}`,
      );
      if (!codeOk(projBody) || !projBody.data) {
        throw new Error(`读项目失败: ${msgOf(projBody)}`);
      }
      const proj = projBody.data;
      const created = [];
      for (const spec of specs) {
        const level = spec.level || '高危';
        const grade = LEVEL_GRADE[level] ?? 3;
        const ts = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
        const askName =
          spec.name || `4869-AI-${spec.status || '待评估'}-${level}-${ts}`;
        const payload = {
          projectId: Number(projectId),
          productId: proj.productId || proj.departmentId,
          askName,
          name: askName,
          source: 1,
          sourceNum: 1,
          type: 1,
          hazardGrade: grade,
          hazardGradeRisk: grade,
          testContent: `<p>c-${askName}</p>`,
          content: `<p>c-${askName}</p>`,
          explain: `<p>e-${askName}</p>`,
          proposal: `<p>p-${askName}</p>`,
        };
        const body = await postJson(`${API_BASE_URL}/loophole/complianceNote`, payload);
        if (!codeOk(body)) {
          throw new Error(`AI note 创建失败 ${askName}: ${msgOf(body)}`);
        }
        created.push({ name: askName, level, status: spec.status || null });
      }
      const notes = await this.listNotes(projectId);
      const ids = [];
      for (const c of created) {
        const hit = notes.find((r) => (r.askName || r.name) === c.name);
        if (hit?.id) {
          c.note_id = Number(hit.id);
          ids.push(Number(hit.id));
        }
      }
      if (ids.length) {
        const bi = await postJson(`${API_BASE_URL}/loophole/complianceNote/batchInsert`, {
          ids,
        });
        if (!codeOk(bi)) {
          // 兼容字段名
          const bi2 = await postJson(`${API_BASE_URL}/loophole/complianceNote/batchInsert`, {
            loopholeIds: ids,
            ids,
          });
          if (!codeOk(bi2)) {
            throw new Error(`AI batchInsert 失败: ${msgOf(bi)} / ${msgOf(bi2)}`);
          }
        }
      }
      const official = await this.listOfficial(projectId);
      for (const c of created) {
        const hit = official.find((r) => (r.askName || r.name || r.loopholeName) === c.name);
        if (hit) c.vuln_id = Number(hit.id);
      }
      return { created, notes: notes.length, official: official.length };
    },

    async batchAudit(ids, complianceStatus) {
      const body = await postJson(`${API_BASE_URL}/loophole/compliance/batchAudit`, {
        ids: ids.map(Number),
        complianceStatus: Number(complianceStatus),
      });
      return { ok: codeOk(body), body, err: msgOf(body) };
    },
  };
}

function buildAiSpecs({ levels, statuses, each = 1 } = {}) {
  const lv = levels || ['提示', '低危', '中危', '高危', '严重'];
  const st = statuses || ['待评估', '待复测', '遗留', '已接受', '已忽略'];
  const specs = [];
  let i = 0;
  for (const level of lv) {
    for (let n = 0; n < each; n += 1) {
      specs.push({
        level,
        status: st[i % st.length],
        node: 'AI安全',
      });
      i += 1;
    }
  }
  return specs;
}

module.exports = { aiComplianceApiAs, buildAiSpecs };
