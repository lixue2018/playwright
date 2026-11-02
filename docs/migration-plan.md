# AT_py → Playwright JS 迁移计划

> 产出日期：2026-09-15  
> 首批目标模块：**4834 邮件提醒流程变更**（当前活跃、用例最完整）  
> 旧脚本保留在 `AT_py/`，新代码落在 `playwright/`，互不覆盖。

## 1. 仓库与职责对照

| 角色 | 路径 | 说明 |
| --- | --- | --- |
| 前台 Vue | `csl-new-front` | TDesign；登录页 `/login`；节点页 `/project/projectLocation/{key}/{id}` |
| 后台 Vue | `csl-new-ui` | Element Plus；登录 `/admin/login`；邮件提醒/发送记录等 |
| 后端 | `csl-new-server` | API 前缀 `/api`；itCode 换 token：`POST /api/auth/login/token` |
| 旧 Python | `AT_py` | Selenium + requests；环境 `config/envs.yaml` |
| 新 JS | `playwright` | `@playwright/test` |

环境（来自 `AT_py/config/envs.yaml`，命令行 `:216`）：

| 环境 | 前台 baseURL | 后台 baseURL |
| --- | --- | --- |
| 216（联调默认） | `http://192.168.50.216:3000` | `http://192.168.50.216` |
| 217 | `http://192.168.50.217:3000` | `http://192.168.50.217` |
| pre | `https://pre.csl.secx` | `https://admin.csl.secx` |

## 2. 旧脚本关键模式（必须等价保留）

### 2.1 登录与鉴权

1. **前台 UI 登录**（`stage1_create_project.run_login`）  
   - 打开 `/login` → 填 itCode（placeholder「请输入账号」）→ 点「登录」  
   - 成功跳转 `/workbench` 或 `/index`  
   - 痛点：`time.sleep(3)`；XPath `//button[.//span[text()='登录']]`；验证码环境会失败  

2. **前台 Token 注入**（`stage5.front_login_itcode`，更稳）  
   - `POST {admin}/api/auth/login/token`，`grantType=itCode`  
   - `localStorage['Portal-Token'] = JSON.stringify({ token })`  
   - Cookie：`Portal-Authorization`、`Authorization=Bearer …`  

3. **后台 UI 登录**（`stage3/admin`）  
   - `/admin/login?redirect=/index` → itCode → 回车或点登录  
   - 无密码框  

4. **API Session**（`cases/4834/.../api/session.py`）  
   - 同上 token 接口；Header：`Authorization: Bearer`、`clientId`、`client-type: client`  

### 2.2 前置造数

- `prepare_data.py --phase all :216`：建项目 + 审批打节点态，**不造威胁/漏洞**  
- 结果写入 `data/fixture_projects.json`（EM01/EM02、`accounts`、节点 can_pause 等）  
- JS 侧：先复用 fixture JSON；后续用 `request` API / 独立 prepare 脚本等价翻译  

### 2.3 核心业务流（4834）

| 用例 ID | 意图 | Python 入口 | JS 规划 |
| --- | --- | --- | --- |
| 登录冒烟 | 前台/后台 itCode 登录 | `run_login` / `admin_login` | `tests/auth.setup.js` + `tests/login.spec.js`（**首批**） |
| SMOKE-CFG-001 | 系统预设规则只读 + 暂停>60天自动关闭 | `smoke_cfg_001` + `admin_mail` | `tests/4834/cfg.spec.js` |
| SMOKE-CFG-002 | 新增项目提醒默认最终处理 | `smoke_cfg_002` | 同上 |
| SMOKE-FP-001 | 接口人申请暂停 + 理由 + 提交 + 邮件 To/CC | `smoke_fp_001` + `front_apply` | `tests/4834/front-pause.spec.js`（**第二批**） |
| SMOKE-FP-002 | 空理由不可提交 | `smoke_fp_002` | 同上 |
| SMOKE-FP-003 | 禁态节点无「申请暂停」 | `smoke_fp_003` | 同上 |
| SMOKE-BP-* | 后台暂停审核通过/驳回 | `admin_ops` | `tests/4834/admin-audit.spec.js` |
| SMOKE-FR/BR/FC/BC | 恢复/关闭申请与审核 | 对应 smoke_* | 分文件迁移 |
| SMOKE-AUTH-001 | 无 interface / 异节点权限负向 | `smoke_auth_001` | `tests/4834/authz.spec.js` |
| logic / api 集 | 纯函数规则 + 无页面 API | `api/rules.py` 等 | `tests/4834/logic.spec.js` + `utils/api/*` |
| 调度类 SKIP | AP/PM/AC 需定时任务 | skip 原因保留 | 标注 manual / 后续 hook |

完整用例表见 `AT_py/cases/4834-邮件提醒流程变更/data/cases_4834.py`（文档注册约 238，可跑约 113）。

### 2.4 原有断言要点（FP-001 示例）

- toast「申请成功」；「申请暂停」变 disabled  
- 留言/操作记录含申请理由与节点名  
- 待办 infoType=31「暂停审核」  
- 邮件名含「节点暂停申请通知」；To=审核人+Backup，CC=接口人（查后台发送记录页，不查真邮箱）  

### 2.5 痛点（迁移时必须消掉）

| 痛点 | Python 现状 | JS 对策 |
| --- | --- | --- |
| 硬等待 | 大量 `time.sleep` | `await expect(...).toBeVisible()` / `toBeHidden()` |
| 点不到按钮 | TinyMCE 挡 footer → JS click 兜底 | `getByRole('dialog').getByRole('button', { name: '提交申请' })` + `force` 仅作最后手段 |
| 脆弱 XPath | `contains(normalize-space(.))` 拼按钮 | `getByRole` / `getByPlaceholder` / 稳定 class |
| 验证码 | UI 登录偶发失败 | setup 优先 API token 注入；另保留一条 UI 登录回归 |
| 双端 baseURL | front:3000 / admin 无端口 | Playwright `projects`：`front` / `admin` 两套 baseURL |
| 角色切换 | 全局 Selenium driver 复用 | 按角色 `storageState`（front_owner / super_admin / auditor） |

## 3. Vue 定位器映射（首批）

### 前台登录 `csl-new-front/.../Login.vue`

- 账号：`getByPlaceholder('请输入账号')`  
- 提交：`getByRole('button', { name: '登录' })`  
- 成功：`expect(page).not.toHaveURL(/login/)` 且可见工作台相关内容  

### 后台登录 `csl-new-ui/.../login.vue`

- 账号：`getByPlaceholder`（i18n `pleaseEnterItCode`，常见「请输入ItCode」类文案）或 `getByRole('textbox')`  
- 提交：`getByRole('button', { name: /登录/ })` 或按回车  
- 成功：URL 含 `/admin/index`  

### 前台节点申请（后续）

- 动作区文案：「申请暂停」「申请恢复测试」「申请关闭」「提交申请」  
- 弹窗：`.pause-apply-dialog` → `getByRole('dialog')`  
- 富文本：TinyMCE iframe → `frameLocator` + `body` 填入，或 `page.evaluate` 调 `tinymce`（对齐 Python，但外层等待用 expect）  

建议前端补 `data-testid`（可选，不改宿主除非确认）：

- `data-testid="node-apply-pause"`  
- `data-testid="pause-apply-submit"`  
- `data-testid="pause-reason-editor"`  

## 4. 目标目录结构

```text
playwright/
├── package.json
├── playwright.config.js
├── .env.example
├── .gitignore
├── docs/
│   └── migration-plan.md          # 本文件
├── utils/
│   ├── env.js                     # 读 FRONT/ADMIN/账号
│   └── api-helper.js              # itCode 换 token、API 封装
├── tests/
│   ├── auth.setup.js              # 保存 storageState
│   ├── login.spec.js              # 首批：UI 登录
│   └── 4834/                      # 后续按模块追加
└── .auth/                         # gitignore：*.json storageState
```

## 5. 分批执行顺序

1. **P0（本次）**：工程脚手架 + 前台/后台登录 setup + `login.spec.js` 试跑  
2. **P1**：翻译 `front_apply` 公共页对象 + SMOKE-FP-002/003（禁态/空理由，依赖少）  
3. **P2**：SMOKE-FP-001 + 发送记录断言（对齐当前 Python 不稳定点）  
4. **P3**：CFG / BP / FR / 关闭链路  
5. **P4**：api/logic 批量 + prepare_data JS 化  
6. **P5**：评估其它 `AT_py/cases/*`（4869、4917、4980…）是否同样迁入  

## 6. 验收标准

- 不用 Python / Selenium；无 `waitForTimeout` 硬等（除非文档化的极少数动画兜底且有 issue 编号）  
- 逻辑与断言对齐 Python，而非只换 click 语法  
- `npx playwright test` 有真实执行结果；失败用 trace/截图修定位器  
- 旧 `AT_py` 文件保留作对照  

## 7. 首批 / P1 试跑范围

- `tests/auth.setup.js`：API 取 token → 注入前台 storageState  
- `tests/login.spec.js` / `admin-login.spec.js`：前台/后台 UI 登录  
- `pages/front-apply.js`：前台申请页对象（无硬等待）  
- `tests/smoke-pause-entry.spec.js`：可暂停节点按钮可见  
- `tests/smoke-fp-002.spec.js`：空理由拦截（SMOKE-FP-002）  
- `tests/smoke-fp-003.spec.js`：禁态不可点 + API 拒绝（SMOKE-FP-003）  
