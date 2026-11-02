/**
 * 审批弹窗漏洞矩阵 API — 对齐 csl-new-ui approvalMatrix/index.ts
 */
const { API_BASE_URL } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');

const MATRIX_ROW_KEYS = ['unfixed', 'legacy', 'accepted', 'ignored'];

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
  return { getJson, headers };
}

async function approvalMatrixApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
  const { getJson } = createClient(request, token);
  const base = `${API_BASE_URL}/loophole/todoVulnerability`;

  return {
    async getMatrix({ projectId, location, secondAudit = 0 } = {}) {
      const params = { projectId: Number(projectId) };
      if (location != null) params.location = Number(location);
      if (secondAudit != null) params.secondAudit = Number(secondAudit);
      return getJson(`${base}/approvalMatrix`, { params });
    },
    async getItems({ projectId, location, secondAudit = 0, matrixStatus, risk } = {}) {
      const params = { projectId: Number(projectId) };
      if (location != null) params.location = Number(location);
      if (secondAudit != null) params.secondAudit = Number(secondAudit);
      if (matrixStatus) params.matrixStatus = matrixStatus;
      if (risk) params.risk = risk;
      return getJson(`${base}/approvalMatrix/items`, { params });
    },
    async getItemDetail(tableName, id) {
      return getJson(`${base}/approvalMatrix/item`, {
        params: { tableName, id: Number(id) },
      });
    },
  };
}

/** 无 Token 探测（SMOKE-API-001） */
async function getMatrixAnonymous(request, { projectId, location = 7, secondAudit = 0 } = {}) {
  const response = await request.get(`${API_BASE_URL}/loophole/todoVulnerability/approvalMatrix`, {
    params: {
      projectId: Number(projectId),
      location: Number(location),
      secondAudit: Number(secondAudit),
    },
    headers: { Accept: 'application/json' },
    ignoreHTTPSErrors: true,
  });
  const body = await response.json().catch(() => ({}));
  if (body && typeof body === 'object') body._http = response.status();
  return body;
}

function assertMatrixShape(body) {
  if (!codeOk(body)) {
    throw new Error(`approvalMatrix 失败: ${msgOf(body) || JSON.stringify(body).slice(0, 300)}`);
  }
  const data = body.data || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const keys = rows.map((r) => r.key);
  for (const k of MATRIX_ROW_KEYS) {
    if (!keys.includes(k)) {
      throw new Error(`矩阵缺行 key=${k}，实际=${keys.join(',')}`);
    }
  }
  if (!data.totalRow || typeof data.totalRow !== 'object') {
    throw new Error('矩阵缺少 totalRow');
  }
  return data;
}

const RISK_FIELD = {
  红线: 'redLine',
  不合规: 'redLine',
  '红线/不合规': 'redLine',
  严重: 'critical',
  高危: 'high',
  中危: 'medium',
  低危: 'low',
  提示: 'info',
  合计: 'rowTotal',
};

function cellCount(data, rowKey, riskLabel) {
  const row = (data.rows || []).find((r) => r.key === rowKey);
  if (!row) return null;
  const field = RISK_FIELD[riskLabel] || riskLabel;
  const n = Number(row[field]);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  MATRIX_ROW_KEYS,
  RISK_FIELD,
  approvalMatrixApiAs,
  getMatrixAnonymous,
  assertMatrixShape,
  cellCount,
};
