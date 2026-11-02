/**
 * 5449 修复项目编号 — API 封装（渗透 / 威胁 / AI / 网络）
 */
const { API_BASE_URL } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');
const { LOOPHOLE_STATUS } = require('./repair-project-rules');

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
  return { getJson, postJson, putJson, headers };
}

function extractRows(body) {
  let rows = body.rows;
  if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    rows = body.data.rows;
  }
  if (rows == null && Array.isArray(body.data)) rows = body.data;
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
}

function extractData(body) {
  if (body && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  return null;
}

async function repairProjectApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
  const { getJson, postJson, putJson } = createClient(request, token);

  return {
    /** 候选修复项目列表（与 UI getProjectList 同源） */
    async listRepairProjectOptions({ productName = '' } = {}) {
      const body = await postJson(`${API_BASE_URL}/detectionprojects/detectionProjectsBase/projectList`, {
        productName,
      });
      const rows = Array.isArray(body.data) ? body.data : extractRows(body);
      return rows
        .map((r) => ({
          id: Number(r.id),
          repairProject: String(r.repairProject || r.projectNo || r.productVersion || ''),
        }))
        .filter((r) => r.id && r.repairProject);
    },

    async pickRepairProjectCode(excludeIds = []) {
      const opts = await this.listRepairProjectOptions();
      const hit = opts.find((o) => !excludeIds.includes(o.id));
      if (!hit) throw new Error('无可用修复项目候选，请确认环境 projectList');
      return hit.repairProject;
    },

    // —— 渗透 ——
    async getLoopholeb(id) {
      const body = await getJson(`${API_BASE_URL}/loophole/loopholeb/${id}`);
      if (!codeOk(body)) throw new Error(`get loopholeb ${id}: ${msgOf(body)}`);
      return extractData(body);
    },

    /**
     * PUT 更新渗透漏洞状态 + 可选编号（只传必要字段，避免整包 VO 校验失败）
     * @param {object} detail getLoopholeb 结果
     */
    async updateLoopholeb(detail, { status, repairProject } = {}) {
      const payload = {
        id: Number(detail.id),
        projectId: detail.projectId,
        name: detail.name,
        status: status != null ? Number(status) : Number(detail.status),
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
      if (repairProject !== undefined) payload.repairProject = repairProject;
      if (Number(payload.status) === LOOPHOLE_STATUS['已修复'] && !payload.repairTime) {
        payload.repairTime =
          detail.repairTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
      const body = await putJson(`${API_BASE_URL}/loophole/loopholeb`, payload);
      return { ok: codeOk(body), body, err: msgOf(body) };
    },

    async setLoopholebFixedWithRepair(id, repairProject) {
      const detail = await this.getLoopholeb(id);
      return this.updateLoopholeb(detail, {
        status: LOOPHOLE_STATUS['已修复'],
        repairProject,
      });
    },

    // —— 威胁（架构/数据/隐私） ——
    async getThreaten(id) {
      const body = await getJson(`${API_BASE_URL}/loophole/threaten/${id}`);
      if (!codeOk(body)) throw new Error(`get threaten ${id}: ${msgOf(body)}`);
      return extractData(body);
    },

    async updateThreaten(detail, { status, repairProject } = {}) {
      const payload = {
        id: Number(detail.id),
        projectId: detail.projectId,
        name: detail.name,
        status: status != null ? Number(status) : Number(detail.status),
        boundary: detail.boundary,
        location: detail.location,
        hazardGrade: detail.hazardGrade,
        hazardGradeRisk: detail.hazardGradeRisk,
        hasProject: detail.hasProject || 1,
        productId: detail.productId,
        typeId: detail.typeId || 1,
        typeName: detail.typeName || '协议安全模块',
        source: detail.source || 1,
        threatType: detail.threatType || 1,
        content: detail.content || '<p>c</p>',
        explain: detail.explain || '<p>e</p>',
        proposal: detail.proposal || '<p>p</p>',
        potentialLosses: detail.potentialLosses ?? 0,
        repeatability: detail.repeatability ?? 0,
        utilizability: detail.utilizability ?? 0,
        affectedUsers: detail.affectedUsers || '0',
        discoverability: detail.discoverability ?? 0,
        hazardScore: detail.hazardScore || '5',
        restorerId: '',
        restorer: '',
        filePathList: [],
        noteBaseInfos: [],
        cvss3: null,
      };
      if (repairProject !== undefined) payload.repairProject = repairProject;
      const body = await putJson(`${API_BASE_URL}/loophole/threaten`, payload);
      return { ok: codeOk(body), body, err: msgOf(body) };
    },

    // —— AI 安全 ——
    async getAiSecurity(id) {
      const body = await getJson(`${API_BASE_URL}/loophole/aiSecurity/${id}`);
      if (!codeOk(body)) throw new Error(`get aiSecurity ${id}: ${msgOf(body)}`);
      return extractData(body);
    },

    async listAiSecurity(projectId, { pageSize = 50 } = {}) {
      const body = await getJson(`${API_BASE_URL}/loophole/aiSecurity/list`, {
        params: { projectId: Number(projectId), pageNum: 1, pageSize },
      });
      return extractRows(body);
    },

    async createAiSecurity(projectId, { name, level = '低危' } = {}) {
      const projBody = await getJson(
        `${API_BASE_URL}/detectionprojects/detectionProjectsBase/${Number(projectId)}`,
      );
      if (!codeOk(projBody) || !projBody.data) {
        throw new Error(`读项目失败: ${msgOf(projBody)}`);
      }
      const proj = projBody.data;
      const grade = level === '提示' ? 0 : level === '低危' ? 1 : level === '中危' ? 2 : 3;
      const askName = name || `5449-AI-${Date.now()}`;
      const payload = {
        projectId: Number(projectId),
        productId: proj.productId || proj.departmentId,
        askName,
        name: askName,
        hasProject: 1,
        source: 1,
        loopType: 1,
        status: 1,
        typeId: 1,
        hazardGrade: grade,
        hazardGradeRisk: grade,
        testContent: `<p>c-${askName}</p>`,
        content: `<p>c-${askName}</p>`,
        explain: `<p>e-${askName}</p>`,
        proposal: `<p>p-${askName}</p>`,
      };
      const body = await postJson(`${API_BASE_URL}/loophole/aiSecurity`, payload);
      if (!codeOk(body)) throw new Error(`create aiSecurity 失败: ${msgOf(body)}`);
      const listed = await this.listAiSecurity(projectId);
      const hit = listed.find((r) => (r.askName || r.name) === askName) || listed[0];
      return { id: hit ? Number(hit.id) : null, name: askName, raw: body };
    },

    async updateAiSecurity(detail, { status, repairProject } = {}) {
      const payload = {
        id: Number(detail.id),
        projectId: detail.projectId,
        askName: detail.askName || detail.name,
        name: detail.name || detail.askName,
        hasProject: detail.hasProject || 1,
        source: detail.source || 1,
        loopType: detail.loopType || 1,
        status: status != null ? Number(status) : Number(detail.status),
        typeId: detail.typeId || 1,
        hazardGrade: detail.hazardGrade,
        hazardGradeRisk: detail.hazardGradeRisk,
        testContent: detail.testContent || detail.content || '<p>c</p>',
        content: detail.content || '<p>c</p>',
        explain: detail.explain || '<p>e</p>',
        proposal: detail.proposal || '<p>p</p>',
        restorerId: '',
        filePathList: [],
      };
      if (repairProject !== undefined) payload.repairProject = repairProject;
      const body = await putJson(`${API_BASE_URL}/loophole/aiSecurity`, payload);
      return { ok: codeOk(body), body, err: msgOf(body) };
    },

    async batchAuditAiSecurity(ids, status, contentMessage = '5449-js') {
      const body = await postJson(`${API_BASE_URL}/loophole/aiSecurity/batchAudit`, {
        ids: ids.map(Number),
        status: Number(status),
        contentMessage,
      });
      return { ok: codeOk(body), body, err: msgOf(body) };
    },

    // —— 网络基础设施 ——
    async getCloudInfra(id) {
      const body = await getJson(`${API_BASE_URL}/loophole/cloudInfraLoophole/${id}`);
      if (!codeOk(body)) throw new Error(`get cloudInfra ${id}: ${msgOf(body)}`);
      return extractData(body);
    },

    /**
     * @param {number[]} ids
     * @param {number|string} status 2=通过 3=不通过
     * @param {string} [repairProject]
     */
    async batchAuditCloudInfra(ids, status, repairProject) {
      // 与后台弹窗一致：loopholeIds 为 JSON 数组字符串
      const payload = {
        loopholeIds: JSON.stringify(ids.map(Number)),
        status: Number(status),
      };
      if (repairProject != null && repairProject !== '') {
        payload.repairProject = repairProject;
      }
      const body = await postJson(`${API_BASE_URL}/loophole/cloudInfraLoophole/batchAudit`, payload);
      return { ok: codeOk(body), body, err: msgOf(body) };
    },
  };
}

module.exports = {
  repairProjectApiAs,
  LOOPHOLE_STATUS,
};
