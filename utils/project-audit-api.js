/**
 * 项目建项 / 节点审批 / nav 状态（API，对齐 4834 prepare）
 *
 * 建项：前台接口人 PUT /detectionProjectsBase（无 id）——与 UI baseUpdate 一致
 * 审批：各节点 /audits；基本信息须先 setServiceLevel，且带 auditLocation: []
 */
const { API_BASE_URL, env } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const {
  codeOk,
  msgOf,
  NODE_LOCATION,
  NODE_AUDIT_PATH,
  NAV_INDEX_TO_NAME,
  LOC_TO_NAME,
  STATUS_LABEL,
  canPause,
  canClose,
  resolveApprovalStatus,
} = require('./rules');
const { auditorForLocation, frontOwner, mergeAccounts } = require('./accounts');

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

async function asItCode(request, itCode) {
  return createClient(request, await fetchAccessToken(request, itCode));
}

function resolveTemplateProjectId(explicit) {
  const fromEnv = env('PSRB_TEMPLATE_PROJECT_ID') || env('PSRB_CLONE_PROJECT_ID');
  if (explicit) return String(explicit);
  if (fromEnv) return String(fromEnv);
  return '4989';
}

function stripAttachment(list) {
  return (list || []).map((d) => ({
    attachmentDocument: d.attachmentDocument,
    attachmentSize: d.attachmentSize || '100000',
    attachmentDocumentTofn: d.attachmentDocumentTofn,
    location: d.location || 1,
    index: String(d.index),
    operaState: 1,
  }));
}

/**
 * 基于模板项目克隆新建（全量审核 filing=0，Windows APP）
 * @returns {{ projectId: number, version: string }}
 */
async function createProjectFromTemplate(request, { version, templateProjectId } = {}) {
  const owner = frontOwner();
  const client = await asItCode(request, owner);
  const tplId = resolveTemplateProjectId(templateProjectId);
  const detailBody = await client.getJson(
    `${API_BASE_URL}/detectionprojects/detectionProjectsBase/${tplId}`,
  );
  if (!codeOk(detailBody) || !detailBody.data) {
    throw new Error(`读模板项目 ${tplId} 失败: ${msgOf(detailBody) || JSON.stringify(detailBody).slice(0, 300)}`);
  }
  const src = detailBody.data;
  const ver =
    version ||
    `${env('PSRB_VERSION_PREFIX', '4834邮件提醒流程变更')}-js-${new Date()
      .toISOString()
      .slice(5, 19)
      .replace(/[-:T]/g, '')}`;

  if (!src.descriptionDocumentList?.length || !src.requirementsDocumentList?.length) {
    throw new Error(`模板 ${tplId} 缺少描述/需求附件，无法克隆建项`);
  }

  const ts = Date.now();
  const payload = {
    departmentId: src.departmentId,
    productId: src.productId || src.departmentId,
    productTypes: ['3'],
    filing: 0,
    version: ver,
    filingMsg: ver,
    pattern: 1,
    isRelease: 2,
    // 用未来日期，避免模板里过期/短格式 reReleaseTime 导致校验失败
    reReleaseTime: '2026-12-31 00:00:00',
    releaseArea: src.releaseArea || 1,
    requireTestDevice: 0,
    prevProductNumber: 0,
    prequalificationStatus: 0,
    lenovoUse: '2',
    productArrange: '1',
    codeCapacity: 1,
    content: ver,
    targetCustomers: 0,
    userVolume: -1,
    safetyRequirements: 0,
    containAi: 1,
    tag: 3,
    sbomList: [
      {
        productType: 3,
        productTypeName: 'Windows APP',
        name: `n${ts}`,
        version: `1.0.${ts % 10000}`,
        parterName: `s${ts}`,
        auditLink: 'http://example.com',
        updateStatus: '1',
        productChannel: '3',
        productChannels: ['3'],
      },
    ],
    androidList: [],
    descriptionDocumentList: [
      {
        attachmentDocument: src.descriptionDocumentList[0].attachmentDocument,
        attachmentSize: '100000',
        attachmentDocumentTofn: src.descriptionDocumentList[0].attachmentDocumentTofn,
        location: 1,
        index: '40',
        operaState: 1,
      },
    ],
    requirementsDocumentList: [
      {
        attachmentDocument: src.requirementsDocumentList[0].attachmentDocument,
        attachmentSize: '100000',
        attachmentDocumentTofn: src.requirementsDocumentList[0].attachmentDocumentTofn,
        location: 1,
        index: '47',
        operaState: 1,
      },
    ],
    sbomDocumentList: [],
    safetyRequirementsFileList: [],
    tabletPreinstalledAppList: [],
  };

  const body = await client.putJson(`${API_BASE_URL}/detectionprojects/detectionProjectsBase`, payload);
  if (!codeOk(body) || body.data == null) {
    throw new Error(
      `建项失败: ${msgOf(body) || JSON.stringify(body).slice(0, 400)} | payload.version=${ver}`,
    );
  }
  return { projectId: Number(body.data), version: ver, owner };
}

async function setServiceLevel(request, projectId, serviceLevel = 'H', itCode) {
  const who = itCode || auditorForLocation(1) || frontOwner();
  const client = await asItCode(request, who);
  const body = await client.postJson(
    `${API_BASE_URL}/detectionprojects/detectionProjectsBase/setServiceLevel`,
    { id: Number(projectId), serviceLevel },
  );
  if (!codeOk(body)) {
    throw new Error(`setServiceLevel 失败: ${msgOf(body) || JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function approveNode(
  request,
  projectId,
  nodeName,
  {
    approvalResult = '审批通过',
    remark = '4834造数',
    itCode,
    serviceLevel = 'H',
  } = {},
) {
  const status = resolveApprovalStatus(approvalResult);
  const [location, secondAudit] = NODE_LOCATION[nodeName] || [];
  if (location == null) throw new Error(`未知节点: ${nodeName}`);
  const path = NODE_AUDIT_PATH[nodeName];
  if (!path) throw new Error(`节点 ${nodeName} 无 audits 路径`);

  if (nodeName === '基本信息') {
    try {
      await setServiceLevel(request, projectId, serviceLevel, itCode);
    } catch (e) {
      // 已通过项目可能禁止再改等级
      if (!String(e.message || e).includes('不允许修改')) throw e;
    }
  }

  const who = itCode || auditorForLocation(location) || frontOwner();
  const client = await asItCode(request, who);
  const payload = {
    projectId: Number(projectId),
    status,
    location,
    secondAudit: secondAudit || 0,
    reviewRemark: remark.startsWith('<') ? remark : `<p>${remark}</p>`,
  };
  if (nodeName === '基本信息') payload.auditLocation = [];
  if (nodeName === '架构审核') payload.type = 2;

  const body = await client.postJson(`${API_BASE_URL}${path}`, payload);
  if (!codeOk(body)) {
    throw new Error(
      `审批失败 ${nodeName} pid=${projectId} status=${status}: ${msgOf(body) || JSON.stringify(body).slice(0, 400)}`,
    );
  }
  return { ok: true, status, body, auditor: who };
}

async function navStatus(request, projectId, itCode) {
  const who = itCode || frontOwner();
  const client = await asItCode(request, who);
  return client.getJson(
    `${API_BASE_URL}/detectionprojects/detectionReview/getNavStatus/${Number(projectId)}`,
  );
}

async function navRows(request, projectId, itCode) {
  const body = await navStatus(request, projectId, itCode);
  const data = codeOk(body) ? body.data : null;
  return Array.isArray(data) ? data : [];
}

function navMap(rows) {
  const out = {};
  for (const row of rows) {
    const index = String(row.index || '').trim();
    if (index === 'dividingLine') continue;
    const loc = row.location;
    const name =
      NAV_INDEX_TO_NAME[index] || LOC_TO_NAME[Number(loc)] || index;
    if (name) out[name] = row;
  }
  return out;
}

function dumpNav(nav) {
  const rows = [];
  for (const [name, row] of Object.entries(nav)) {
    const st = row.status;
    const loc = row.location;
    rows.push({
      name,
      status: st,
      status_label: STATUS_LABEL[Number(st)] || String(st ?? ''),
      location: loc,
      can_pause: canPause(st),
      can_close:
        name === '终审' || name === '项目终审' || Number(loc) === 10
          ? canClose(st)
          : false,
    });
  }
  return rows;
}

function firstOpenSecurityNode(nav) {
  const { resolveFocusNode, pauseNodeCandidates } = require('./node-order');
  const skip = new Set(['基本信息', '终审', '项目终审']);
  const focus = resolveFocusNode();
  if (focus && !skip.has(focus) && nav[focus] && canPause(nav[focus].status)) {
    return focus;
  }
  const order = pauseNodeCandidates().filter((n) => !skip.has(n));
  for (const name of order) {
    const row = nav[name];
    if (!row || skip.has(name)) continue;
    if (canPause(row.status)) return name;
  }
  for (const [name, row] of Object.entries(nav)) {
    if (skip.has(name)) continue;
    if (canPause(row.status)) return name;
  }
  return null;
}

function accountsForFixture() {
  const a = mergeAccounts();
  return {
    super_admin: a.super_admin,
    mail_reminder_manager: a.mail_reminder_manager,
    front_owner: a.front_owner,
    other_project_owner: a.other_project_owner,
    no_interface_user: a.no_interface_user,
    no_email_owner: a.no_email_owner || '',
    node_auditors: a.node_auditors,
  };
}

module.exports = {
  createProjectFromTemplate,
  setServiceLevel,
  approveNode,
  navStatus,
  navRows,
  navMap,
  dumpNav,
  firstOpenSecurityNode,
  accountsForFixture,
  resolveTemplateProjectId,
};
