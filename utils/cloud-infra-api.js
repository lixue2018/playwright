/**
 * 网络基础设施 cloudInfraLoophole — 写 xlsx 导入 + frontBatchAudit + batchAudit
 */
const fs = require('fs');
const path = require('path');
const { API_BASE_URL, ROOT } = require('./env');
const { fetchAccessToken, authHeaders } = require('./api-helper');
const { codeOk, msgOf } = require('./rules');

const INFRA_LEVEL_NUM = {
  提示: 1,
  低危: 3,
  中危: 5,
  高危: 7,
  严重: 9,
  红线: 10,
  不合规: 10,
};
const INFRA_RISK_SHORT = {
  提示: '提示',
  低危: '低',
  中危: '中',
  高危: '高',
  严重: '严重',
  红线: '红线',
  不合规: '不合规',
};
/** 通用六态 → 基建处置文案 / disposalStatus */
const STATUS_TO_INFRA = {
  待评估: { label: '待修复', code: 1 },
  待复测: { label: '待修复', code: 1 },
  待修复: { label: '待修复', code: 1 },
  遗留: { label: '遗留', code: 2 },
  已修复: { label: '已修复', code: 3 },
  已忽略: { label: '误报', code: 17 },
  误报: { label: '误报', code: 17 },
  已接受: { label: '已接受', code: 16 },
  已缓解: { label: '已缓解', code: 14 },
  已消减: { label: '已消减', code: 15 },
};

function extractRows(body) {
  let rows = body.rows;
  if (rows == null && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    rows = body.data.rows;
  }
  if (rows == null && Array.isArray(body.data)) rows = body.data;
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
}

/** 无依赖：STORE 方式写最小 OOXML xlsx */
function writeInfraXlsx(filePath, specs) {
  const headers = [
    '资产类型',
    '资产名称',
    '资产IP',
    'DNS',
    '漏洞名称',
    '漏洞详情',
    '修复建议',
    '端口',
    '漏洞级别',
    '利用成熟度',
    '暴露位置',
    'cve',
    '风险等级',
    '提交时间',
  ];
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = specs.map((spec, idx) => {
    const grade = spec.grade || spec.level || '高危';
    const name = spec.name || `4869-INFRA-${grade}-${Date.now()}-${idx}`;
    return [
      '主机',
      `4869-asset-${idx + 1}`,
      `10.0.0.${8 + (idx % 200)}`,
      'qa.4869.local',
      name,
      `4869导入 ${grade}`,
      '按建议修复',
      '443',
      INFRA_LEVEL_NUM[grade] ?? 7,
      'poc',
      '公网',
      '',
      INFRA_RISK_SHORT[grade] || grade,
      stamp,
    ];
  });

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function colLetter(i) {
    let s = '';
    let n = i;
    while (true) {
      const r = n % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor(n / 26) - 1;
      if (n < 0) break;
    }
    return s;
  }
  function cell(ref, val) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return `<c r="${ref}"><v>${val}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
  }

  const sheetRows = [headers, ...rows].map((row, ridx) => {
    const cells = row.map((v, c) => cell(`${colLetter(c)}${ridx + 1}`, v)).join('');
    return `<row r="${ridx + 1}">${cells}</row>`;
  });
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${sheetRows.join('')}</sheetData></worksheet>`;
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const wbRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const files = {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': wbRels,
    'xl/worksheets/sheet1.xml': sheet,
  };

  // ZIP local file header + central directory (store only)
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc placeholder 0 ok for many importers; set properly
    const crc = crc32(data);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, data);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([...parts, centralBuf, end]));
  return filePath;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

async function cloudInfraApiAs(request, itCode) {
  const token = await fetchAccessToken(request, itCode);
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

  return {
    async list(projectId, { pageSize = 100 } = {}) {
      const all = [];
      let page = 1;
      while (page <= 20) {
        let body = null;
        for (const p of [
          `${API_BASE_URL}/loophole/cloudInfraLoophole/list`,
          `${API_BASE_URL}/cloudInfraLoophole/list`,
        ]) {
          body = await getJson(p, {
            params: { projectId: Number(projectId), pageNum: page, pageSize },
          });
          if (codeOk(body) || extractRows(body).length) break;
        }
        const batch = extractRows(body || {});
        all.push(...batch);
        if (batch.length < pageSize) break;
        page += 1;
      }
      return all;
    },

    async importXlsx(projectId, xlsxPath) {
      const buf = fs.readFileSync(xlsxPath);
      const paths = [
        `${API_BASE_URL}/loophole/cloudInfraLoophole/importData`,
        `${API_BASE_URL}/cloudInfraLoophole/importData`,
      ];
      let last = '';
      for (const url of paths) {
        const response = await request.post(url, {
          multipart: {
            file: {
              name: path.basename(xlsxPath),
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: buf,
            },
          },
          params: { projectId: Number(projectId) },
          headers,
          ignoreHTTPSErrors: true,
          timeout: 120_000,
        });
        const body = await response.json().catch(() => ({}));
        if (codeOk(body)) return { ok: true, path: url, body };
        last = `${url} ${msgOf(body)}`;
      }
      return { ok: false, error: last };
    },

    async frontBatchAudit(projectId, ids, disposalStatus, remark = '4869-js前台处置') {
      const payload = {
        projectId: Number(projectId),
        ids: ids.map(Number),
        disposalStatus: Number(disposalStatus),
        disposalMethod: remark,
        contentMessage: remark,
      };
      for (const url of [
        `${API_BASE_URL}/loophole/cloudInfraLoophole/frontBatchAudit`,
        `${API_BASE_URL}/cloudInfraLoophole/frontBatchAudit`,
      ]) {
        const body = await postJson(url, payload);
        if (codeOk(body)) return { ok: true, n: ids.length, body };
      }
      return { ok: false, n: 0 };
    },

    async batchPass(projectId, ids, remark = '4869-js后台通过') {
      const payload = {
        projectId: Number(projectId),
        ids: ids.map(Number),
        status: 1,
        contentMessage: remark,
      };
      for (const url of [
        `${API_BASE_URL}/loophole/cloudInfraLoophole/batchAudit`,
        `${API_BASE_URL}/cloudInfraLoophole/batchAudit`,
      ]) {
        const body = await postJson(url, payload);
        if (codeOk(body)) return { ok: true, n: ids.length };
      }
      return { ok: false, n: 0 };
    },

    /**
     * 导入 specs → 按名称改处置 → 可选后台通过
     * @param {Array<{name:string,level?:string,grade?:string,status?:string}>} specs
     */
    async seedImportAndDispose(projectId, specs, { batchPass = true } = {}) {
      const dir = path.join(ROOT, 'logs', 'datagen');
      fs.mkdirSync(dir, { recursive: true });
      const xlsx = path.join(dir, `infra_import_${Date.now()}.xlsx`);
      writeInfraXlsx(xlsx, specs);
      const imp = await this.importXlsx(projectId, xlsx);
      if (!imp.ok) throw new Error(`基建导入失败: ${imp.error}`);

      // 等列表可见
      let rows = [];
      for (let i = 0; i < 10; i += 1) {
        rows = await this.list(projectId);
        if (rows.length) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      let disposed = 0;
      for (const spec of specs) {
        const st = STATUS_TO_INFRA[spec.status || '待修复'] || STATUS_TO_INFRA['待修复'];
        const hit = rows.find(
          (r) =>
            String(r.name || r.loopholeName || '').includes(spec.name) ||
            spec.name.includes(String(r.name || '')),
        );
        if (!hit?.id) continue;
        const res = await this.frontBatchAudit(projectId, [hit.id], st.code);
        if (res.ok) disposed += 1;
      }

      let passed = 0;
      if (batchPass && rows.length) {
        const ids = rows.map((r) => Number(r.id)).filter(Boolean);
        const res = await this.batchPass(projectId, ids);
        if (res.ok) passed = res.n;
      }
      return { xlsx, imported: true, listed: rows.length, disposed, passed };
    },
  };
}

function buildInfraSpecs({ levels, statuses, each = 1 } = {}) {
  const lv = levels || ['提示', '低危', '中危', '高危', '严重'];
  const st = statuses || ['待修复', '已修复', '已缓解', '已消减', '误报', '已接受'];
  const specs = [];
  let i = 0;
  for (const level of lv) {
    for (let n = 0; n < each; n += 1) {
      const status = st[i % st.length];
      i += 1;
      specs.push({
        name: `4869-INFRA-${status}-${level}-${Date.now()}-${i}`,
        level,
        grade: level,
        status,
        node: '网络基础设施审核',
      });
    }
  }
  return specs;
}

module.exports = {
  INFRA_LEVEL_NUM,
  INFRA_RISK_SHORT,
  STATUS_TO_INFRA,
  writeInfraXlsx,
  cloudInfraApiAs,
  buildInfraSpecs,
};
