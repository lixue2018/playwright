# AT_py → Playwright 缺口清单与实施顺序

> 更新日期：2026-09-15
> 对照：`AT_py/`（旧） vs `playwright/`（新）

## 0. 当前已落地（对照）

Phase A～C 已开工：配置/file 软链、多角色 storageState、4834 冒烟主链路用例已入库。调度类为 `test.fixme`。

| 已有 | 对应旧能力 |
| --- | --- |
| `package.json` / `playwright.config.js` / `.env.example` | 工程脚手架 |
| `utils/env.js`（硬编码默认 216） | `url_config` / `envs.yaml` 的极简版 |
| `utils/api-helper.js` | `session.login` + token 注入 |
| `utils/node-apply-api.js` / `utils/rules.js` | `node_apply_api` / `rules` 全量纯函数 |
| `pages/front-apply.js` | `ui/front_apply.py` 部分 |
| `tests/auth.setup.js` + `login` / `admin-login` | 登录 |
| `tests/smoke-fp-002/003` + `smoke-pause-entry` | SMOKE-FP-002/003 + 入口冒烟 |

**4834 Phase E 已完成**：冒烟（含 BR/BC）+ logic 全量 + 可跑 API 主链路已入库；调度类仍为 `test.fixme`。  
**Phase G 已完成**：README / CI 收尾；`psrb_platform` 弃掉不迁。

---

## 1. 原封不动复制 / 软链（资产与配置，不重写逻辑）

> 原则：二进制、YAML、用例文档、样例账号模板 → **复制或软链**；大文件沿用 AT_py 的「本地有、不入库」策略。

| 旧路径 | 新路径建议 | 说明 |
| --- | --- | --- |
| `AT_py/file/` | `playwright/file/` 或软链 `../AT_py/file` | 上传样例（基线/开源/源码/xlsx/png）。**体积大，勿强行 git 入库**；`.gitignore` 继续忽略 `file/` |
| `AT_py/extras/file/` | 按需软链 | 同上 |
| `AT_py/config/envs.yaml` | `playwright/config/envs.yaml` | 环境 host 表，复制后由 JS 读取 |
| `AT_py/config/accounts.example.yaml` | `playwright/config/accounts.example.yaml` | 账号模板 |
| `AT_py/config/local/.gitkeep` | `playwright/config/local/.gitkeep` | 本地机密占位 |
| `AT_py/cases/4834-.../data/fixture_projects.json` | `playwright/fixtures/4834/fixture_projects.json`（或继续读 AT_py 路径） | 造数产物；可复制快照，运行时以 prepare 刷新为准 |
| `AT_py/cases/4834-.../测试用例_*.md` / `prd/4834/*` | `playwright/docs/4834/` | 用例文档对照，复制即可 |
| `AT_py/cases/*/README.md` | 各模块 `docs/` | 操作说明 |
| `.gitignore` 中与资产相关的规则 | 合并进 `playwright/.gitignore` | 补：`file/`、`logs/`、`config/local/**`、`*.exe`、`html.zip` 等 |

**不建议复制：**

| 路径 | 原因 |
| --- | --- |
| `archive/` | 历史归档，不迁 |
| `logs/`、`__pycache__/`、截图 png | 运行产物 |
| `psrb_platform/` | 独立任务台/服务，非 E2E 用例本体；**弃掉，不迁** |
| `extras/edge-*` | 边缘小工具，与 PSRB E2E 无关 |
| `*.py` 源码 | 应翻译为 JS，禁止当脚本继续跑 |

---

## 2. 需重构为 JS 的能力（按层）

### 2.1 基建层（所有用例依赖）

| 旧模块 | 新目标 | 状态 |
| --- | --- | --- |
| `url_config.py` + `boot_test_env(:216)` | `utils/env.js` 读 `config/envs.yaml` + CLI `--env` | **部分**（缺 YAML / `:216`） |
| `config/accounts` + `cases/4834/data/accounts.py` | `utils/accounts.js` | **未做** |
| `repo_paths.py` | 路径解析可简化进 `env.js` | **未做** |
| `log_manager.py` | Playwright `reporter` + trace/screenshot | **用框架替代，不平移** |
| `common/stages/browser_driver.py` | Playwright 内置 | **废弃** |
| `common/stages/session_keep.py` | `storageState` 多角色 | **仅 front_owner**，缺 admin/auditor |
| `api/session.py` | `utils/api-helper.js` 扩展 | **部分** |

### 2.2 造数 / Stage 流水线

| 旧模块 | 新目标 | 状态 |
| --- | --- | --- |
| `cases/4834/.../prepare_data.py` | `scripts/prepare-4834.js`（建项+打节点态，无威胁漏洞） | **已做**（API 克隆建项 + audits） |
| `common/stages/stage1_create_project.py` | `scripts/stages/create-project.js` | **已做**（PUT 克隆模板） |
| `stage3_approve_node.py` | `scripts/stages/approve-node.js` | **已做**（API audits） |
| `stage5_front_baseline_submit.py` | `scripts/stages/front-submit.js`（上传依赖 `file/`） | **未做** |
| `stage2_add_threat` / `stage4_add_vuln` | `threaten-api` / `loopholeb-api` / `ai-compliance-api` / `cloud-infra-api` | **已做**（API 造数；前台上传见 front-submit） |
| `造数/*.py`（约 25 个入口） | `scripts/datagen/*.js` | **全部未做** |
| `common/00-公共造数流程/` | `scripts/pipeline/` | **未做** |

### 2.3 4834 用例与页对象

| 旧模块 | 新目标 | 状态 |
| --- | --- | --- |
| `ui/front_apply.py` | `pages/front-apply.js` | **部分**（缺 TinyMCE 填理由、恢复/关闭） |
| `ui/admin_mail.py` | `pages/admin-mail.js` | **未做** |
| `ui/admin_ops.py` | `pages/admin-ops.js` | **未做** |
| `api/mail_reminder_api.py` | `utils/mail-reminder-api.js` | **未做** |
| `api/send_record_api.py` | `utils/send-record-api.js` | **未做** |
| `api/rules.py` 全量 + logic 单测 | `utils/rules.js` + `tests/4834/logic/rules.spec.js` | **已做** |
| `data/cases_4834.py` 注册表 | `fixtures/4834/cases.js` | **已做** |
| `run_4834.py` 调度（CASE_SET/CASE_ONLY/KEEP_GOING） | `playwright.config` project + grep / env | **已做**（KEEP_GOING 用 Playwright 默认失败继续策略另议） |
| SMOKE-FP-001 | `tests/4834/smoke-fp-001.spec.js` | **已做** |
| SMOKE-CFG-001/002 | `tests/4834/smoke-cfg.spec.js` | **已做** |
| SMOKE-BP/FR/BR/FC/BC/AUTH | 对应 spec | **已做** |
| SMOKE-AP/PM/AC/TODO（调度 SKIP） | 标注 manual 或 hook | **已做**（`test.fixme`） |
| TC-* api/logic（约百条可跑） | `tests/4834/api|logic/*.spec.js` | **已做**（可跑 ID 全覆盖；预置 skip 不迁） |

### 2.4 其它需求包（整包未迁）

| 包 | 建议 | 状态 |
| --- | --- | --- |
| `4869-节点审批漏洞矩阵` | 强依赖全量造数+上传 | **已收口冒烟**：create/vuln/status + NEW/DRW/APR/LOOP/MTX；全量威胁/前台包见 datagen 子集 |

| `4917-增加漏洞修复时间` | 中优先级 | 未做 |
| `4980-Windows-BIOS-渗透测试指派` | 依赖 BIOS 文件与指派流 | 未做 |
| `4488-4421-Checkmarx` | 专项 | 未做 |
| `4287-windows自测邮件通知优化` | 专项 | 未做 |

### 2.5 明确不迁 / 弃掉

- `psrb_platform/`（Web 任务台）— **弃掉，不另仓迁移**
- `extras/edge-*`
- `archive/`
- Python `2main.py` 入口（用 `npm run` / `npx playwright` 替代）

---

## 3. 目标目录（迁完后的理想结构）

```text
playwright/
├── package.json
├── playwright.config.js
├── .gitignore                 # 合并 AT_py 资产忽略规则
├── .env.example
├── config/
│   ├── envs.yaml              # 复制
│   ├── accounts.example.yaml  # 复制
│   └── local/                 # gitignore
├── file/                      # 软链或本地复制（gitignore）
├── fixtures/4834/
│   ├── fixture_projects.json
│   ├── accounts.js
│   └── cases.js
├── pages/
│   ├── front-apply.js
│   ├── admin-mail.js
│   └── admin-ops.js
├── utils/
│   ├── env.js / accounts.js / api-helper.js
│   ├── rules.js / node-apply-api.js
│   ├── mail-reminder-api.js / send-record-api.js
│   └── auth-states.js         # 多角色 storageState
├── scripts/
│   ├── prepare-4834.js
│   ├── stages/                # create / approve / front-submit / vuln
│   └── datagen/               # 原 造数/ 入口
├── tests/
│   ├── auth.setup.js
│   ├── login.spec.js
│   ├── admin-login.spec.js
│   └── 4834/
│       ├── smoke-fp-*.spec.js
│       ├── smoke-cfg|bp|fr|fc|auth.spec.js
│       ├── api/*.spec.js
│       └── logic/*.spec.js
└── docs/
    ├── migration-plan.md
    ├── migration-gap.md       # 本文件
    └── 4834/                  # 用例文档复制
```

---

## 4. 实施顺序（推荐）

### Phase A — 资产与配置就位（0.5～1 天）

1. 合并 `.gitignore`（`file/`、`config/local/**`、`logs/` 等）
2. 复制 `config/envs.yaml`、`accounts.example.yaml`
3. `file/`：**软链到 AT_py/file**（推荐）或文档说明「本地拷贝」
4. 复制 4834 用例 md → `docs/4834/`
5. `utils/env.js` 改为读 YAML + 支持 `--env 216` / `PSRB_TEST_ENV`

### Phase B — 鉴权与账号基建（0.5 天）

6. `utils/accounts.js`（对齐 `data/accounts.py`）
7. 多角色 setup：`front-owner` / `super-admin` / 节点审核人 `storageState`
8. 后台 `request` API 客户端统一封装

### Phase C — 4834 冒烟主链路（3～5 天）**【当前主线】**

9. **P2** TinyMCE 填理由 + **SMOKE-FP-001** + 发送记录 API/UI
10. **P3a** `pages/admin-mail.js` + **SMOKE-CFG-001/002**
11. **P3b** `pages/admin-ops.js` + **SMOKE-BP-001/002**
12. **P3c** FR / BR / FC / BC / AUTH 冒烟
13. 调度类（AP/PM/AC/TODO）入库为 `test.fix` + 原因，不硬做

### Phase D — 造数 JS 化（5～8 天，阻塞其它包）

14. ~~`scripts/prepare-4834.js`~~ **已落地**（默认 **页面** 建项+审批；`--via api` 保留接口克隆）
15. ~~`stages/create-project`、`approve-node`~~ **已落地**（API）；另有 `*-ui.js` 页面版
16. 有上传场景再接 `file/` + `front-submit`
17. 跑通「JS 造数 → JS 冒烟」闭环（`npm run prepare:4834 -- --phase all :216`）

### Phase E — 4834 API / logic 批量（3～5 天）**【已完成】**

18. ~~`fixtures/4834/cases.js` 注册表~~ **已落地**  
19. ~~`utils/rules.js` 补全 + `tests/4834/logic`~~ **已落地**  
20. ~~可跑 TC-* 按模块批量翻译~~ **已落地**（CFG/FP/BP/FR/FC/BR/BC/AUTH/HIST + SMOKE-BR/BC）  
21. ~~`CASE_ONLY` / `CASE_SET`~~ **已落地**（env + npm scripts）

> 文档注册约 237 / 可跑约 113：logic+api+smoke 已覆盖可跑 ID；预置 skip（调度/UI/脏数据）仍见 `cases.js`。  
> 关闭审核冒烟：`RUN_CLOSE=1 npm run test:br-bc -- --grep SMOKE-BC-001`  
> **页面优先**：默认 `CASE_SET=smoke`；API 套件显式 `CASE_SET=api`。  
> **失败留窗**：默认 `KEEP_BROWSER=1`（有头 + maxFailures=1 + pause），人工复看后终端按 Enter。  

### Phase F — 其它需求包（按业务优先级）

22. **4869**：**冒烟收口完成**（跳过 23 其它需求包）
    - prepare create/vuln/status；loopholeb + approval-matrix + admin-matrix
    - NEW-001～003、DRW-001/002/004、APR-001/002、LOOP-001/002、MTX-004/005/008、API-001
    - 待续（非阻塞）：LOOP-003/004、DRW-003、架构威胁全量种子
23. 4917 → 4980 → 4488 → 4287（**暂缓**）
24. ~~`造数/run_full_nodes_all_bugs`~~ → `scripts/datagen/run-full-nodes-all-bugs.js` **已落地（API 全节点）**  
    - 威胁 / 渗透 / AI / 基建：JS API；开源基线：`front-submit.js`（可 `SKIP_FRONT=1`）  
    - `npm run datagen:full -- --fresh :216`；见 `scripts/datagen/README.md`

### Phase G — 收尾 **【已完成】**

25. ~~README 全面替换 AT_py 操作说明~~ **已落地**（`README.md` + `docs/4834/README.md`）
26. ~~CI：`npx playwright test` + 环境密钥~~ **已落地**（`.github/workflows/playwright.yml`；logic 常跑 / e2e 靠 Secrets + `RUN_E2E`）
27. ~~评估是否另仓迁移 `psrb_platform`~~ **弃掉，不迁**

---

## 5. 优先级一句话

| 优先级 | 做什么 |
| --- | --- |
| **P0** | Phase A 复制配置 + file 软链 + envs.yaml |
| **P1** | Phase B 多角色登录 |
| **P2** | SMOKE-FP-001（你接下来最该做的用例） |
| **P3** | CFG / BP / 恢复关闭冒烟 |
| **P4** | prepare_data JS + 脱钩 Python 造数 |
| **P5** | 4834 api/logic 批量 |
| **P6** | 其它 cases + 造数全家桶 |

---

## 6. 复制 vs 重构速查

| 类型 | 清单 |
| --- | --- |
| **复制/软链** | `file/`、`envs.yaml`、`accounts.example.yaml`、用例 md、fixture 快照、gitignore 规则 |
| **必须 JS 重构** | url/env、accounts、session、stages、造数、4834 ui/api/run、其它 cases |
| **用 Playwright 替代、不翻译** | Selenium driver、log_manager 截图体系、time.sleep 轮询 |
| **不迁 / 弃掉** | archive、extras、psrb_platform（弃） |
