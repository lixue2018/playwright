const { API_BASE_URL, CLIENT_ID } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk } = require('./rules');

function createApiClient(request, token) {
  const headers = authHeaders(token);

  async function getJson(url, options = {}) {
    const response = await request.get(url, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      ignoreHTTPSErrors: true,
    });
    const body = await response.json().catch(() => ({ _http: response.status() }));
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

function createNodeApplyApi(request, token) {
  const { getJson, postJson } = createApiClient(request, token);
  const base = `${API_BASE_URL}/detectionprojects/nodeApply`;
  const REASON_HTML = '<p>4834-QA-申请理由</p>';

  return {
    REASON_HTML,
    async current(projectId, location, secondAudit = 0) {
      return getJson(`${base}/current`, {
        params: {
          projectId: Number(projectId),
          location: Number(location),
          secondAudit: Number(secondAudit || 0),
        },
      });
    },
    async currentData(projectId, location, secondAudit = 0) {
      const body = await this.current(projectId, location, secondAudit);
      const data = codeOk(body) ? body.data : null;
      return data && typeof data === 'object' ? data : {};
    },
    async pause(projectId, location, { reason = REASON_HTML, secondAudit = 0 } = {}) {
      return postJson(`${base}/pause`, {
        projectId: Number(projectId),
        location: Number(location),
        secondAudit: Number(secondAudit || 0),
        reason,
      });
    },
    /** 原始 pause 体（缺 projectId 等负向用例） */
    async pausePayload(payload) {
      return postJson(`${base}/pause`, payload);
    },
    async resume(projectId, location, secondAudit = 0) {
      return postJson(`${base}/resume`, {
        projectId: Number(projectId),
        location: Number(location),
        secondAudit: Number(secondAudit || 0),
      });
    },
    async close(projectId, { reason = REASON_HTML, location = 10, secondAudit = 0 } = {}) {
      return postJson(`${base}/close`, {
        projectId: Number(projectId),
        location: Number(location),
        secondAudit: Number(secondAudit || 0),
        reason,
      });
    },
    async audit(applyId, pass, auditReason) {
      const payload = { applyId: Number(applyId), pass: Boolean(pass) };
      if (!pass) payload.auditReason = auditReason || '4834-QA-驳回原因';
      return postJson(`${base}/audit`, payload);
    },
    async auditPayload(payload) {
      return postJson(`${base}/audit`, payload);
    },
  };
}

const SYS_UNSUBMIT_ID = 1;
const SYS_PAUSE_ID = 12;
const TYPE_UNSUBMIT = 1;
const TYPE_PAUSE = 5;

function createMailReminderApi(request, token) {
  const { getJson } = createApiClient(request, token);
  return {
    async listRules(params = {}) {
      return getJson(`${API_BASE_URL}/system/mail/reminder/list`, {
        params: { pageNum: 1, pageSize: 20, ...params },
      });
    },
    async listRows(params = {}) {
      const body = await this.listRules(params);
      let rows = body.rows;
      if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
        rows = body.data.rows;
      }
      if (rows == null && Array.isArray(body.data)) rows = body.data;
      return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
    },
    async detail(ruleId) {
      return getJson(`${API_BASE_URL}/system/mail/reminder/${Number(ruleId)}`);
    },
    async nodeList(type) {
      return getJson(`${API_BASE_URL}/system/mail/reminder/nodeList`, {
        params: { type: Number(type) },
      });
    },
    async findPauseRule() {
      const candidates = [];
      for (const rid of [SYS_PAUSE_ID, TYPE_PAUSE, 5, 1]) {
        const body = await this.detail(rid);
        if (codeOk(body) && body.data && typeof body.data === 'object') {
          candidates.push(body.data);
        }
      }
      const rows = (await this.listRows({ type: TYPE_PAUSE })) || (await this.listRows());
      candidates.push(...rows);
      for (const data of candidates) {
        const typ = data.type;
        const typeOne = data.typeOne;
        if ([TYPE_PAUSE, 5].includes(typ) || [TYPE_PAUSE, 5].includes(typeOne)) return data;
      }
      throw new Error(
        `未找到 type=5 暂停邮件规则（尝试 id=${SYS_PAUSE_ID}/5/1 与 list）`,
      );
    },
    async findUnsubmitRule() {
      const body = await this.detail(SYS_UNSUBMIT_ID);
      if (codeOk(body) && body.data && typeof body.data === 'object') return body.data;
      const rows = await this.listRows({ type: TYPE_UNSUBMIT });
      for (const row of rows) {
        if ([TYPE_UNSUBMIT, 1].includes(row.type)) return row;
      }
      throw new Error('未找到 type=1 节点未提交材料提醒规则');
    },
  };
}

function createSendRecordApi(request, token) {
  const { getJson } = createApiClient(request, token);

  function itcodeInList(blob, itCode) {
    if (!itCode) return false;
    const s = String(blob || '').toLowerCase().replace(/\s/g, '');
    const code = itCode.trim().toLowerCase();
    return s.includes(code) || s.includes(`${code}@lenovo.com`);
  }

  function extractRows(body) {
    if (!codeOk(body)) return [];
    const data = body.data || body.rows || {};
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === 'object') rows = data.rows || data.list || [];
    return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  }

  return {
    itcodeInList,
    async listRecords({ title = '', pageNum = 1, pageSize = 50 } = {}) {
      const params = { pageNum, pageSize };
      if (title) params.title = title;
      let body = await getJson(`${API_BASE_URL}/system/mail/template/getRecordList`, { params });
      if (!codeOk(body) && (body._http === 404 || body.code === 404)) {
        body = await getJson(`${API_BASE_URL}/mail/template/getRecordList`, { params });
      }
      return body;
    },
    async find(titleKeyword, { extraKeywords = [], retries = 5 } = {}) {
      const extras = extraKeywords.filter(Boolean);
      let last = [];
      for (let i = 0; i < Math.max(1, retries); i += 1) {
        const body = await this.listRecords({ title: titleKeyword, pageSize: 50 });
        const rows = extractRows(body);
        const hits = [];
        for (const row of rows) {
          const title = String(row.title || '');
          const blob = ['title', 'toUsers', 'ccUsers', 'content', 'projectName', 'newData']
            .map((k) => String(row[k] || ''))
            .join(' ');
          if (!title.includes(titleKeyword) && !blob.includes(titleKeyword)) continue;
          if (extras.length && !extras.some((e) => title.includes(e) || blob.includes(e))) continue;
          hits.push(row);
        }
        hits.sort((a, b) =>
          String(b.sendTime || b.createTime || b.id || '').localeCompare(
            String(a.sendTime || a.createTime || a.id || ''),
          ),
        );
        last = hits;
        if (hits.length) return hits;
        await new Promise((r) => {
          setTimeout(r, 1500);
        });
      }
      return last;
    },
    assertToCc(row, { toItcodes = [], ccItcodes = [] } = {}) {
      const toBlob = String(row.toUsers || '');
      const ccBlob = String(row.ccUsers || '');
      const missingTo = toItcodes.filter((c) => c && !itcodeInList(toBlob, c));
      const missingCc = ccItcodes.filter((c) => c && !itcodeInList(ccBlob, c));
      if (missingTo.length) {
        throw new Error(`邮件发送人列表缺 ${missingTo}；实际 toUsers=${toBlob} title=${row.title}`);
      }
      if (missingCc.length) {
        throw new Error(`邮件抄送人列表缺 ${missingCc}；实际 ccUsers=${ccBlob} title=${row.title}`);
      }
    },
  };
}

async function nodeApplyApiAs(request, itCode) {
  return createNodeApplyApi(request, await fetchAccessToken(request, itCode));
}

async function mailReminderApiAs(request, itCode) {
  return createMailReminderApi(request, await fetchAccessToken(request, itCode));
}

async function sendRecordApiAs(request, itCode) {
  return createSendRecordApi(request, await fetchAccessToken(request, itCode));
}

/** 未登录 GET（AUTH 负向） */
async function anonymousGetJson(request, path, params = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await request.get(url, {
    params,
    headers: {
      Accept: 'application/json, text/plain, */*',
      clientId: CLIENT_ID,
      'client-type': 'client',
      'X-Requested-With': 'XMLHttpRequest',
    },
    ignoreHTTPSErrors: true,
  });
  const body = await response.json().catch(() => ({}));
  if (body && typeof body === 'object') body._http = response.status();
  return body;
}

/** 未登录 POST（AUTH 负向） */
async function anonymousPostJson(request, path, data) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await request.post(url, {
    data,
    headers: {
      Accept: 'application/json, text/plain, */*',
      clientId: CLIENT_ID,
      'client-type': 'client',
      'X-Requested-With': 'XMLHttpRequest',
    },
    ignoreHTTPSErrors: true,
  });
  const body = await response.json().catch(() => ({}));
  if (body && typeof body === 'object') body._http = response.status();
  return body;
}

module.exports = {
  SYS_UNSUBMIT_ID,
  SYS_PAUSE_ID,
  TYPE_UNSUBMIT,
  TYPE_PAUSE,
  createNodeApplyApi,
  createMailReminderApi,
  createSendRecordApi,
  nodeApplyApiAs,
  mailReminderApiAs,
  sendRecordApiAs,
  anonymousGetJson,
  anonymousPostJson,
};
