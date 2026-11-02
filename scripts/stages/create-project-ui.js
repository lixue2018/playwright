/**
 * 前台新建审核项目（页面）— 对齐 AT_py create_project_front.run_create_project_light
 * 默认：全量审核 + 终端硬件交付 + Windows APP（无部署位）。
 * 全量组成：传 components / allComponents，默认交付改为容器化+私有化/容器交付。
 * 前台页面新建项目。API 克隆建项已废弃。
 */
const path = require('path');
const fs = require('fs');
const { FRONT_BASE_URL, env } = require('../../utils/env');
const { allComponentNames, componentCandidates } = require('../../utils/components');

function sampleXlsx() {
  const p = path.join(__dirname, '..', '..', 'file', '基础设施审核-导入漏洞模板.xlsx');
  if (!fs.existsSync(p)) throw new Error(`建项材料不存在: ${p}`);
  return p;
}

async function dismissTips(page) {
  for (let i = 0; i < 6; i += 1) {
    // 先等遮罩出现再关
    const dialog = page.locator('.t-dialog__ctx--fixed, .t-dialog, .el-dialog, [role=dialog]').filter({
      hasText: /提示|如实填写|安全审核|知道了|产品安全/,
    });
    if (await dialog.first().isVisible({ timeout: 800 }).catch(() => false)) {
      const btn = dialog
        .locator('button, .t-button')
        .filter({ hasText: /知道了|我知道了|确认|确定/ })
        .first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
      }
    }
    const closed = await page.evaluate(() => {
      function vis(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }
      function txt(el) {
        return (el.innerText || '').replace(/\s+/g, ' ').trim();
      }
      let n = 0;
      const dialogs = [...document.querySelectorAll('.t-dialog,.t-dialog__ctx,.el-dialog,[role=dialog]')].filter(vis);
      for (const d of dialogs) {
        const body = txt(d);
        if (
          body.includes('产品交付方式') &&
          (body.includes('终端硬件') || body.includes('容器化') || body.includes('纯软件') || body.includes('服务器端'))
        ) {
          continue;
        }
        for (const b of [...d.querySelectorAll('button,.t-button')].filter(vis)) {
          const t = txt(b).replace(/\s+/g, '');
          const tipLike =
            body.includes('如实填写') ||
            body.includes('安全审核标准') ||
            body.includes('产品安全审核') ||
            body.includes('感谢您的支持') ||
            /^提示/.test(body) ||
            body.includes('提示');
          if (['知道了', '我知道了'].includes(t) || (tipLike && ['确认', '确定'].includes(t))) {
            try {
              b.click();
              n += 1;
            } catch {
              /* ignore */
            }
          }
        }
      }
      return n;
    });
    // 仍有阻挡点击的 dialog mask 则强制隐藏（非交付弹窗）
    await page.evaluate(() => {
      document.querySelectorAll('.t-dialog__ctx--fixed').forEach((ctx) => {
        const t = (ctx.innerText || '');
        if (t.includes('产品交付方式')) return;
        if (t.includes('知道了') || t.includes('提示') || t.includes('如实填写') || t.includes('安全审核')) {
          const btn = [...ctx.querySelectorAll('button')].find((b) =>
            /知道了|确认|确定/.test((b.innerText || '').replace(/\s+/g, '')),
          );
          if (btn) btn.click();
        }
      });
    });
    if (!closed) {
      // 确认没有遮罩挡着
      const blocked = await page.locator('.t-dialog__ctx--fixed').isVisible().catch(() => false);
      if (!blocked) break;
    }
    await page.waitForTimeout(400);
  }
  // 最后再等遮罩消失
  await page.locator('.t-dialog__ctx--fixed').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectProduct(page, productName) {
  /**
   * 源码：basicInfo/index.vue → t-tree-select(filterable) v-model=productId
   * 选中后 v-if=form.productName → 换成 disabled t-input 展示名称
   */
  const treeSelect = page.locator('.t-tree-select').first();
  const inp = page.getByRole('textbox', { name: '请选择产品' }).or(page.locator('input[placeholder="请选择产品"]')).first();
  await inp.waitFor({ state: 'visible', timeout: 30_000 });
  await inp.scrollIntoViewIfNeeded();

  // 1) 先打开，等到组织树数据渲染出节点（deptTreeSelect）
  // 若仍有提示弹窗遮罩，force 点击
  if (await treeSelect.isVisible().catch(() => false)) {
    await treeSelect.click({ force: true });
  } else {
    await inp.click({ force: true });
  }
  await page.waitForTimeout(400);
  const treeReady = page.locator('.t-popup .t-tree__item, .t-tree-select__popup .t-tree__item, .t-tree__item').first();
  try {
    await treeReady.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    await inp.click();
    await treeReady.waitFor({ state: 'visible', timeout: 15_000 });
  }
  console.log('[create-ui] 产品树已加载');

  // 2) filterable 输入过滤
  await inp.click({ clickCount: 3 });
  await inp.fill('');
  await inp.pressSequentially(productName, { delay: 40 });
  await page.waitForTimeout(1000);

  // 叶子可选：deptForEach 把有 children 的节点 disabled=true，只能点叶子
  const exactRe = new RegExp(`^\\s*${escapeRegex(productName)}\\s*$`);
  const leaf = page
    .locator('.t-tree__item:not(.t-is-disabled) > .t-tree__label, .t-tree__item:not(.t-is-disabled) .t-tree__label')
    .filter({ hasText: exactRe })
    .last();

  if (await leaf.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await leaf.click();
  } else {
    const hit = await page.evaluate((name) => {
      function vis(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }
      const items = [...document.querySelectorAll('.t-tree__item')].filter(vis);
      const sample = items.slice(0, 20).map((it) => ({
        text: (it.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        disabled: it.classList.contains('t-is-disabled') || it.getAttribute('aria-disabled') === 'true',
      }));
      // 优先非 disabled 且 label 精确匹配
      for (const it of items) {
        const disabled = it.classList.contains('t-is-disabled') || it.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        const lab = it.querySelector('.t-tree__label') || it;
        const t = (lab.innerText || '').replace(/\s+/g, ' ').trim();
        if (t === name) {
          lab.click();
          return { ok: true };
        }
      }
      // 再试：任意精确 label（含可能未标 disabled 的）
      for (const lab of [...document.querySelectorAll('.t-tree__label')].filter(vis)) {
        if ((lab.innerText || '').replace(/\s+/g, ' ').trim() !== name) continue;
        const item = lab.closest('.t-tree__item');
        if (item && (item.classList.contains('t-is-disabled') || item.getAttribute('aria-disabled') === 'true')) {
          continue;
        }
        lab.click();
        return { ok: true };
      }
      return { ok: false, sample };
    }, productName);
    if (!hit?.ok) {
      throw new Error(`产品树未找到可点叶子「${productName}」，可见=${JSON.stringify(hit?.sample || [])}`);
    }
  }

  // 新建态不会切到 disabled input（那是编辑已有 productName）；
  // 选中后 t-tree-select 去掉 empty，输入框/展示区出现产品名
  await page.waitForTimeout(600);
  const shown = await page.evaluate((name) => {
    const wrap = document.querySelector('.t-tree-select');
    if (!wrap) return '';
    const empty = wrap.className.includes('t-select-input--empty');
    const inp = wrap.querySelector('input');
    const v = (inp && inp.value) || '';
    const text = (wrap.innerText || '').replace(/\s+/g, ' ');
    if (!empty && (v.includes(name) || text.includes(name))) return v || name;
    // 有的版本把选中值放在 .t-input__inner 的 value 或旁侧
    if (v.includes(name)) return v;
    if (text.includes(name) && !empty) return name;
    return '';
  }, productName);

  if (!shown) {
    // 再给一次机会：直接取 popup 外展示
    const again = await page.locator('.t-tree-select').innerText().catch(() => '');
    const inpVal = await page.getByRole('textbox', { name: '请选择产品' }).inputValue().catch(() => '');
    if (String(again).includes(productName) || String(inpVal).includes(productName)) {
      console.log(`[create-ui] 产品名称 = ${inpVal || productName}`);
      await page.keyboard.press('Escape').catch(() => {});
      return;
    }
    throw new Error(
      `产品名称未回填「${productName}」 treeText=${String(again).slice(0, 80)} input="${inpVal}"`,
    );
  }
  console.log(`[create-ui] 产品名称 = ${shown}`);
  await page.keyboard.press('Escape').catch(() => {});
}

async function selectAuditMode(page, modeName = '全量审核') {
  const ok = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('.t-form__item,.t-form-item')];
    let root = null;
    for (const it of items) {
      const lab = it.querySelector('.t-form__label,.t-form-item__label,label');
      const t = ((lab && lab.innerText) || '').replace(/\s+/g, ' ').trim();
      if (t.includes('审核模式') || t.includes('Review Mode')) {
        root = it;
        break;
      }
    }
    root = root || document;
    const radios = [...root.querySelectorAll('label.t-radio-button,.t-radio-button')];
    for (const el of radios) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t === name || t.startsWith(name)) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return t;
      }
    }
    return '';
  }, modeName);
  if (!ok) throw new Error(`未选中审核模式：${modeName}`);
}

async function fillVersionAndMsg(page, version) {
  await selectAuditMode(page, '全量审核');
  const ver = page.locator('input[placeholder="请输入版本号"]').first();
  await ver.click();
  await ver.fill(version);
  const area = page
    .locator('textarea[placeholder*="研发需求"], textarea[placeholder*="请详细说明"], textarea')
    .first();
  await area.click();
  await area.fill(version);
}

async function uploadByLabel(page, labelKeyword, filePath) {
  const handle = await page.evaluateHandle((label) => {
    const items = [...document.querySelectorAll('.t-form__item,.t-form-item,.el-form-item')];
    let target = null;
    for (const item of items) {
      const lab = item.querySelector('.t-form__label,.t-form-item__label,.el-form-item__label,label');
      const t = ((lab && lab.innerText) || item.innerText || '').replace(/\s+/g, '');
      if (t.includes(label.replace(/\s+/g, ''))) {
        target = item;
        break;
      }
    }
    if (!target) return null;
    let input = target.querySelector('input[type=file]');
    if (!input) {
      const btn = [...target.querySelectorAll('button,.t-button,span')].find(
        (b) => (b.innerText || '').includes('选择文件') || (b.innerText || '').includes('点击上传'),
      );
      if (btn) btn.click();
      input = target.querySelector('input[type=file]');
    }
    if (input) {
      input.style.display = 'block';
      input.style.visibility = 'visible';
      input.style.opacity = '1';
    }
    return input;
  }, labelKeyword);
  const el = handle.asElement();
  if (!el) throw new Error(`定位上传控件失败「${labelKeyword}」`);
  await el.setInputFiles(filePath);
  await page.waitForTimeout(800);
}

async function clickRadioNearLabel(page, labelText, optionText) {
  const ok = await page.evaluate(
    ({ labelText: lab, optionText: opt }) => {
      const items = [...document.querySelectorAll('.t-form__item,.t-form-item,.el-form-item')];
      let root = null;
      for (const it of items) {
        const t = (it.innerText || '').replace(/\s+/g, ' ');
        if (t.includes(lab)) {
          root = it;
          break;
        }
      }
      root = root || document.body;
      const radios = [...root.querySelectorAll('label.t-radio,.t-radio,label.el-radio,.el-radio')];
      for (const r of radios) {
        const t = (r.innerText || '').replace(/\s+/g, ' ').trim();
        if (t === opt || t.includes(opt)) {
          r.click();
          return t;
        }
      }
      return '';
    },
    { labelText, optionText },
  );
  if (!ok) throw new Error(`单选未找到 ${labelText}=${optionText}`);
}

async function selectOptionAfterLabel(page, labelText, optionText) {
  // 源码：上次审核编号 / 产品大小 均为 t-select + t-option
  const formItem = page
    .locator('.t-form__item, .t-form-item')
    .filter({
      has: page.locator('.t-form__label, .t-form-item__label, label').filter({ hasText: labelText }),
    })
    .first();
  await formItem.scrollIntoViewIfNeeded().catch(() => {});
  const selectBox = formItem.locator('.t-select, .t-select__wrap, .t-input__wrap').first();
  if (await selectBox.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await selectBox.click();
  } else {
    await formItem.locator('input').first().click();
  }
  await page.waitForTimeout(400);

  const exactRe = new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`);
  const optionLocators = [
    page.getByRole('listitem', { name: optionText, exact: true }),
    page.getByRole('option', { name: optionText, exact: true }),
    page.locator(`[title="${optionText}"]`).first(),
    page.locator('.t-popup .t-select-option, .t-select-option').filter({ hasText: exactRe }).first(),
  ];
  for (const loc of optionLocators) {
    if (await loc.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await loc.click();
      console.log(`[create-ui] ${labelText} = ${optionText}`);
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape').catch(() => {});
      return;
    }
  }

  const picked = await page.evaluate((option) => {
    function vis(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }
    const candidates = [
      ...document.querySelectorAll(
        `[role=listitem],[role=option],li.t-select-option,.t-select-option,[title="${option}"],.t-popup li`,
      ),
    ].filter(vis);
    const hit =
      candidates.find((e) => (e.getAttribute('title') || '').trim() === option) ||
      candidates.find((e) => (e.innerText || '').replace(/\s+/g, ' ').trim() === option);
    if (!hit) {
      return {
        ok: false,
        sample: candidates.slice(0, 10).map((e) => (e.innerText || e.getAttribute('title') || '').trim().slice(0, 50)),
      };
    }
    hit.click();
    return { ok: true };
  }, optionText);
  if (!picked?.ok) {
    throw new Error(
      `下拉「${labelText}」找不到选项「${optionText}」，可见样例=${JSON.stringify(picked?.sample || [])}`,
    );
  }
  console.log(`[create-ui] ${labelText} = ${optionText} (evaluate)`);
  await page.keyboard.press('Escape').catch(() => {});
}

/** 上线/上市日期：用真实点击写入 t-date-picker，并核对输入框已有值 */
async function pickListingDate(page, daysAhead = 3) {
  const item = page.locator('.t-form__item, .t-form-item').filter({ hasText: /上线日期|上市日期/ }).first();
  const input = item.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  await input.scrollIntoViewIfNeeded();
  await input.click({ force: true });
  await page.waitForTimeout(400);

  const target = new Date();
  target.setDate(target.getDate() + daysAhead);
  const day = String(target.getDate());
  const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  const dayRe = new RegExp(`^\\s*${day}\\s*$`);

  // 目标跨月时点下一月（最多翻 2 次）
  for (let hop = 0; hop < 3; hop += 1) {
    const cells = page.locator(
      '.t-date-picker__panel .t-date-picker__cell:not(.t-date-picker__cell--disabled):not(.t-date-picker__cell--additional) .t-date-picker__cell-inner',
    );
    const exact = cells.filter({ hasText: dayRe });
    if (await exact.count()) {
      await exact.last().click();
      break;
    }
    const next = page
      .locator(
        '.t-date-picker__panel .t-date-picker__header-controller--next,.t-date-picker__header .t-icon-chevron-right,button[title*="下"],.t-pagination__btn-next',
      )
      .first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(300);
      continue;
    }
    // 回退：点当月任一可选日
    if (await cells.count()) {
      await cells.last().click();
      break;
    }
    throw new Error(`日期面板找不到 ${dateStr} 的可选日期`);
  }

  await page.waitForTimeout(300);
  const val = (await input.inputValue().catch(() => '')).trim();
  if (!val) {
    throw new Error(`上线日期未写入，input 为空，期望 ${dateStr}`);
  }
  console.log(`[create-ui] 上线日期 = ${val}`);
  await page.keyboard.press('Escape').catch(() => {});
}

async function dismissTransientTips(page) {
  await page.evaluate(() => {
    function vis(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }
    for (const d of [...document.querySelectorAll('.t-dialog,.t-message,.t-notification,[role=dialog]')].filter(vis)) {
      const body = (d.innerText || '').replace(/\s+/g, ' ');
      if (body.includes('产品交付方式')) continue;
      if (/Android|整机|勾选|警告|提示/.test(body)) {
        const btn = [...d.querySelectorAll('button,.t-button')].find((b) =>
          /知道了|确认|确定|关闭/.test((b.innerText || '').replace(/\s+/g, '')),
        );
        if (btn) btn.click();
      }
    }
  });
  await page.waitForTimeout(200);
}

async function checkComponent(page, name) {
  const cands = componentCandidates(name);
  for (const cand of cands) {
    const ok = await page.evaluate((want) => {
      const root = document.querySelector('#productTypes') || document.body;
      const labels = [...root.querySelectorAll('label, .t-checkbox, span')];
      for (const el of labels) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t !== want && !t.includes(want)) continue;
        const checked =
          el.classList.contains('t-is-checked') ||
          !!(el.querySelector('input') || {}).checked ||
          el.getAttribute('aria-checked') === 'true' ||
          !!el.querySelector('.t-is-checked');
        if (!checked) el.click();
        return true;
      }
      return false;
    }, cand);
    if (ok) {
      console.log(`[create-ui] 产品组成 = ${cand}`);
      await page.waitForTimeout(250);
      await dismissTransientTips(page);
      return true;
    }
  }
  return false;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string[]} names
 * @param {{ allowMissing?: boolean }} [opts]
 */
async function checkComponents(page, names, opts = {}) {
  const unique = [];
  for (const n of names || []) {
    if (n && !unique.includes(n)) unique.push(n);
  }
  const missing = [];
  for (const name of unique) {
    const hit = await checkComponent(page, name);
    if (!hit) missing.push(name);
  }
  if (missing.length) {
    const msg = `页面缺少产品组成：${missing.join(', ')}`;
    if (opts.allowMissing) console.log(`[create-ui] ⚠️ ${msg}（已跳过）`);
    else throw new Error(msg);
  }
  await page.waitForTimeout(600);
}

function sbomTextValue(header, placeholder, rowIndex) {
  const h = String(header || '').replace(/\s+/g, '');
  const ph = String(placeholder || '');
  if (/链接|备注|说明|操作|更新状态|渠道|固件/.test(h)) return '';
  if (/Package|包名/.test(h) || /Package|包名/.test(ph)) return 'com.lenovo.at.test';
  if (/APK/.test(h) || /APK/.test(ph)) return 'AT_Test_App';
  if (/VersionCode/.test(h) || (/版本号/.test(h) && !/VersionName/.test(h))) return '1';
  if (/供应|自研|Supplier|伙伴/.test(h) || /供应商|自研|Supplier/.test(ph)) return '自研';
  if (/VersionName|^版本$|版本/.test(h) || /版本/.test(ph)) return '1.0.0';
  if (/名称|硬件|软件|Name/.test(h)) return `AT-COMP-${rowIndex + 1}`;
  if (/CPU|架构/.test(h)) return 'x86_64';
  return '';
}

async function chooseOpenOption(page, prefer) {
  const popup = page.locator('.t-popup:visible').last();
  const preferOpt = popup.locator('.t-select-option').filter({ hasText: prefer }).first();
  if (await preferOpt.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await preferOpt.click();
    return true;
  }
  const first = popup.locator('.t-select-option:not(.t-is-disabled)').first();
  if (await first.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await first.click();
    return true;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

async function selectIfEnabled(page, selectLocator, prefer) {
  if (!(await selectLocator.isVisible({ timeout: 400 }).catch(() => false))) return false;
  const disabled = await selectLocator.evaluate((el) =>
    el.classList.contains('t-is-disabled') || el.getAttribute('aria-disabled') === 'true',
  );
  if (disabled) return false;
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  await page.waitForTimeout(200);
  return chooseOpenOption(page, prefer);
}

async function fillSbomMinimal(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) =>
      (e.innerText || '').includes('产品组成') && e.children.length < 5,
    );
    if (el) el.scrollIntoView({ block: 'center' });
    else window.scrollBy(0, 600);
  });
  await page.waitForTimeout(500);

  const tables = page.locator('.t-table:visible');
  const tableCount = await tables.count();
  let written = 0;
  for (let ti = 0; ti < tableCount; ti += 1) {
    const table = tables.nth(ti);
    const blob = await table.innerText().catch(() => '');
    if (!/更新状态|APK|Package|Supplier|硬件|产品组成|VersionName/.test(blob)) continue;
    const headers = await table.locator('thead th').evaluateAll((ths) =>
      ths.map((th) => (th.innerText || '').replace(/\s+/g, '')),
    );
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    for (let ri = 0; ri < rowCount; ri += 1) {
      const row = rows.nth(ri);
      if (!(await row.isVisible().catch(() => false))) continue;
      const cells = row.locator(':scope > td');
      const cellCount = await cells.count();
      for (let ci = 0; ci < cellCount; ci += 1) {
        const val = sbomTextValue(headers[ci], '', ri);
        if (!val) continue;
        const inp = cells.nth(ci).locator('input.t-input__inner:not([readonly]):not([disabled]), textarea:not([readonly])').first();
        if (!(await inp.isVisible({ timeout: 200 }).catch(() => false))) continue;
        if ((await inp.inputValue().catch(() => '')).trim()) continue;
        await inp.scrollIntoViewIfNeeded();
        await inp.click();
        await inp.fill(val);
        written += 1;
      }
    }
  }

  const cpu = page.locator('.t-form__item, .t-form-item').filter({ hasText: /CPU架构|CPU\s*架构/ }).locator('input:not([readonly])').first();
  if (await cpu.isVisible({ timeout: 500 }).catch(() => false)) {
    if (!(await cpu.inputValue().catch(() => '')).trim()) {
      await cpu.click();
      await cpu.fill('x86_64');
      written += 1;
    }
  }
  console.log(`[create-ui] SBOM 文本字段写入 ${written} 处`);
  // 点一次表格外，让可编辑单元格把 editValue 写回行数据。逐格 Tab 会触发两次保存，把值冲掉。
  await page.locator('input[placeholder="请输入版本号"]').first().click();
  await page.waitForTimeout(400);

  let statusPairs = 0;
  for (let ti = 0; ti < tableCount; ti += 1) {
    const table = tables.nth(ti);
    const headers = await table.locator('thead th').evaluateAll((ths) =>
      ths.map((th) => (th.innerText || '').replace(/\s+/g, '')),
    );
    const statusIdx = headers.findIndex((h) => h.includes('更新状态'));
    const channelIdx = headers.findIndex((h) => /渠道|发布渠道/.test(h));
    const fwIdx = headers.findIndex((h) => /固件|F\/W|FW/.test(h));
    const linkIdx = headers.findIndex((h) => /审核项目地址|审核链接|上一版本/.test(h));
    if (statusIdx < 0 && fwIdx < 0 && channelIdx < 0) continue;
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    for (let ri = 0; ri < rowCount; ri += 1) {
      const row = rows.nth(ri);
      if (!(await row.isVisible().catch(() => false))) continue;
      if (statusIdx >= 0) {
        const statusCell = row.locator(':scope > td').nth(statusIdx);
        const first = statusCell.locator('.t-select').first();
        const firstOk = await selectIfEnabled(page, first, /在当前项目审核/);
        if (firstOk) {
          await page.waitForTimeout(300);
          const second = statusCell.locator('.t-select').nth(1);
          const secondOk = await selectIfEnabled(page, second, /首次审核/);
          if (secondOk) statusPairs += 1;
        } else if (linkIdx >= 0) {
          const linkInp = row.locator(':scope > td').nth(linkIdx).locator('input.t-input__inner:not([readonly])').first();
          if (await linkInp.isVisible({ timeout: 300 }).catch(() => false)) {
            if (!(await linkInp.inputValue().catch(() => '')).trim()) {
              await linkInp.click();
              await linkInp.fill('https://csl.lenovo.com/at');
              await linkInp.press('Tab');
            }
          }
        }
      }
      if (channelIdx >= 0) {
        const sel = row.locator(':scope > td').nth(channelIdx).locator('.t-select').first();
        await selectIfEnabled(page, sel, /.*/);
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (fwIdx >= 0) {
        const sel = row.locator(':scope > td').nth(fwIdx).locator('.t-select').first();
        await selectIfEnabled(page, sel, /^否$/);
      }
    }
  }

  console.log(`[create-ui] SBOM 更新状态已选 ${statusPairs} 行`);
  await page.keyboard.press('Escape').catch(() => {});
  const synced = await syncSbomModel(page);
  console.log(`[create-ui] SBOM 模型 ${JSON.stringify(synced)}`);
}

/** 表格编辑态的输入不一定写回行数据；提交校验读的是行数据 */
async function syncSbomModel(page) {
  return page.evaluate(() => {
    function findState() {
      const root = document.querySelector('#app');
      const start = (root && (root._vnode || (root.__vue_app__ && root.__vue_app__._container && root.__vue_app__._container._vnode))) || null;
      const seen = new Set();
      function walk(vnode, depth) {
        if (!vnode || depth > 60 || seen.has(vnode)) return null;
        seen.add(vnode);
        if (vnode.component) {
          const s = vnode.component.setupState;
          if (s && (s.productTypeSbom || s.productAndroidSbom)) return s;
          const hit = walk(vnode.component.subTree, depth + 1);
          if (hit) return hit;
        }
        const children = vnode.children;
        if (Array.isArray(children)) {
          for (const child of children) {
            const hit = walk(child, depth + 1);
            if (hit) return hit;
          }
        }
        return null;
      }
      return walk(start, 0);
    }
    const state = findState();
    if (!state) return { ok: false, reason: 'no-state' };
    const unwrap = (v) => (v && !Array.isArray(v) && Array.isArray(v.value) ? v.value : v);
    const list = unwrap(state.productTypeSbom);
    if (!Array.isArray(list)) return { ok: false, reason: 'no-list' };
    list.forEach((row, i) => {
      const pt = Number(row.productType);
      if (!row.name) row.name = `AT-COMP-${i + 1}`;
      if (!row.version) row.version = '1.0.0';
      if (!row.parterName) row.parterName = '自研';
      if (pt === 4) {
        if (!row.auditLink) row.auditLink = 'https://csl.lenovo.com/at';
      } else {
        if (!row.updateStatusFirst) row.updateStatusFirst = '1';
        if (!row.updateStatus) row.updateStatus = '1';
      }
      if (pt === 6 && (row.optionUpgraded === undefined || row.optionUpgraded === null || row.optionUpgraded === '')) {
        row.optionUpgraded = 0;
      }
      if (pt === 3 && (!Array.isArray(row.productChannels) || row.productChannels.length === 0)) {
        row.productChannels = ['1'];
      }
    });
    const android = unwrap(state.productAndroidSbom);
    if (Array.isArray(android)) {
      android.forEach((row, i) => {
        if (!row.apkName) row.apkName = `AT_Test_App_${i + 1}`;
        if (!row.packageName) row.packageName = `com.lenovo.at.test${i + 1}`;
        if (!row.supplierList) row.supplierList = '自研';
        if (!row.baseVersionName) row.baseVersionName = '1.0.0';
        if (!row.baseVersionCode) row.baseVersionCode = '1';
      });
    }
    return {
      ok: true,
      count: list.length,
      android: Array.isArray(android) ? android.length : 0,
      missing: list
        .filter((row) => !row.name || !row.version || !row.parterName)
        .map((row) => row.productType),
    };
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} delivery
 * @param {{ deployMode?: string, deploySecond?: string, deployRoom?: string }} [opts]
 */
async function fillDelivery(page, delivery = '终端硬件交付', opts = {}) {
  const exists = await page.evaluate(
    () => (document.body.innerText || '').includes('产品交付方式') || (document.body.innerText || '').includes('交付方式'),
  );
  if (!exists) return;
  const btn = page.locator('.t-form__item, .t-form-item').filter({ hasText: /产品交付方式/ }).locator('button').filter({ hasText: /选择/ }).first();
  if (!(await btn.isVisible({ timeout: 3_000 }).catch(() => false))) return;
  await btn.click();
  const dialog = page.locator('.t-dialog:visible').filter({ hasText: /产品交付方式/ }).last();
  await dialog.waitFor({ state: 'visible', timeout: 8_000 });
  const row = dialog.locator('tbody tr').filter({ hasText: delivery }).first();
  if (!(await row.isVisible({ timeout: 3_000 }).catch(() => false))) {
    throw new Error(`交付弹窗未找到：${delivery}`);
  }
  const radio = row.locator('.t-radio, input[type=radio]').first();
  if (await radio.isVisible().catch(() => false)) await radio.click();
  else await row.locator('td').first().click();
  await page.waitForTimeout(400);
  const checked = await row.locator('.t-is-checked').count();
  if (!checked) throw new Error(`交付方式未选中：${delivery}`);
  console.log(`[create-ui] 交付方式 = ${delivery}`);

  const needDeploy = delivery && !/终端硬件|纯软件/.test(delivery);
  const deployMode = opts.deployMode || '私有化部署';
  const deploySecond = opts.deploySecond || '容器交付';
  const deployRoom = opts.deployRoom || 'AT自动化机房';
  if (needDeploy) {
    const firstSel = dialog.locator('.t-select').first();
    const modeOk = await selectIfEnabled(page, firstSel, new RegExp(deployMode));
    if (!modeOk) throw new Error(`部署位置未选中：${deployMode}`);
    console.log(`[create-ui] 部署选项 = ${deployMode}`);
    await page.waitForTimeout(300);
    const secondSel = dialog.locator('.t-select').nth(1);
    if (await secondSel.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const secondOk = await selectIfEnabled(page, secondSel, new RegExp(deploySecond));
      if (!secondOk) throw new Error(`二级部署未选中：${deploySecond}`);
      console.log(`[create-ui] 部署选项 = ${deploySecond}`);
    }
    const room = dialog.locator('textarea:visible').first();
    if (await room.isVisible({ timeout: 500 }).catch(() => false)) {
      await room.click();
      await room.fill(deployRoom);
      await room.press('Tab');
      console.log(`[create-ui] 机房 = ${deployRoom}`);
    }
  }

  await dialog.locator('button').filter({ hasText: /确定|确认/ }).last().click();
  await page.waitForTimeout(500);
  if (await dialog.isVisible().catch(() => false)) {
    const msg = await page.locator('.t-message, .el-message').allInnerTexts().catch(() => []);
    throw new Error(`交付方式弹窗未关闭：${msg.join(' | ').slice(0, 200)}`);
  }
}

async function submitAndWaitId(page) {
  const submit = page.getByRole('button', { name: /提交/ }).or(page.locator('button').filter({ hasText: /^提交$/ })).first();
  await submit.click();
  await page.waitForTimeout(800);
  const ok = page.locator('.t-dialog, .el-message-box, .el-dialog').locator('button').filter({ hasText: /确定|确认/ }).last();
  if (await ok.isVisible({ timeout: 2_000 }).catch(() => false)) await ok.click();

  // 校验失败时尽快抛错，避免空等 60s 像“卡住”
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (/\/basic\/\d+/.test(page.url())) break;
    const errText = await page.evaluate(() => {
      const errs = [...document.querySelectorAll('.t-form__controls--extra, .t-input__extra, .el-form-item__error, .t-is-error')]
        .map((e) => (e.innerText || '').trim())
        .filter(Boolean);
      const msgs = [...document.querySelectorAll('.t-message, .el-message')].map((e) => (e.innerText || '').trim());
      return [...errs, ...msgs].join(' | ').slice(0, 300);
    });
    if (/不能为空|必填|失败|请选择|请填写|请正确|不完整|不正确/.test(errText)) {
      throw new Error(`建项提交校验失败：${errText || '(无文案)'} url=${page.url()}`);
    }
    await page.waitForTimeout(500);
  }
  if (!/\/basic\/\d+/.test(page.url())) {
    throw new Error(`提交后未拿到 projectId url=${page.url()}`);
  }
  const m = page.url().match(/\/basic\/(\d+)/);
  return Number(m[1]);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   version: string,
 *   productName?: string,
 *   component?: string,
 *   components?: string[],
 *   allComponents?: boolean,
 *   delivery?: string,
 *   deployMode?: string,
 *   deploySecond?: string,
 *   deployRoom?: string,
 *   allowMissingComponents?: boolean,
 * }} opts
 */
async function createProjectUi(page, opts) {
  const version = opts.version;
  const productName = opts.productName || env('PSRB_PRODUCT_NAME', 'iCarbon');
  let components = Array.isArray(opts.components) ? [...opts.components] : null;
  if (!components && opts.allComponents) components = allComponentNames();
  if (!components) components = [opts.component || 'Windows APP'];

  const multi = components.length > 1 || !!opts.allComponents;
  const delivery =
    opts.delivery ||
    env('PSRB_DELIVERY_OPTION', multi ? '容器化交付' : '终端硬件交付');
  const deployMode = opts.deployMode || env('PSRB_DEPLOY_MODE', '私有化部署');
  const deploySecond = opts.deploySecond || env('PSRB_DEPLOY_SECOND', '容器交付');
  const deployRoom = opts.deployRoom || env('PSRB_DEPLOY_ROOM', 'AT自动化机房');
  const xlsx = sampleXlsx();

  console.log(
    `[create-ui] 打开新建页 product=${productName} version=${version} components=${components.length} delivery=${delivery}`,
  );
  await page.goto(`${FRONT_BASE_URL}/project/projectLocation/basic`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissTips(page);

  await selectProduct(page, productName);
  await fillVersionAndMsg(page, version);
  await uploadByLabel(page, '产品需求清单', xlsx);
  await selectOptionAfterLabel(page, '上次审核编号', '无');
  await clickRadioNearLabel(page, '是否通过架构安全预审', '未通过').catch(() => {});
  await selectOptionAfterLabel(page, '产品大小', '0-20000');
  await pickListingDate(page, 3);
  await uploadByLabel(page, '产品描述文档', xlsx);
  await clickRadioNearLabel(page, '产品发布地域', 'ROW').catch(() => {});
  await clickRadioNearLabel(page, '生成式AI', '是').catch(async () => {
    await clickRadioNearLabel(page, '生成式AI功能', '是').catch(() => {});
  });
  await checkComponents(page, components, { allowMissing: !!opts.allowMissingComponents });
  await fillSbomMinimal(page);
  await fillDelivery(page, delivery, { deployMode, deploySecond, deployRoom });
  // 底部必填单选（对齐 create_project_front._fill_bottom_radios）
  for (const [lab, opt] of [
    ['联想SDK', '否'],
    ['使用联想SDK', '否'],
    ['目标客户', 'To B'],
    ['特定安全要求', '否'],
    ['安全要求', '否'],
  ]) {
    await clickRadioNearLabel(page, lab, opt).catch(() => {});
  }

  const projectId = await submitAndWaitId(page);
  console.log(`[create-ui] OK project_id=${projectId}`);
  return { projectId, version, components, delivery };
}

module.exports = { createProjectUi, checkComponents };
