# Playwright E2E（PSRB）

本目录是 PSRB 前后台端到端 / API / 规则单测的**唯一执行入口**。旧 `AT_py`（Selenium + Python）仅作历史对照，日常造数与跑测请用本文命令。

默认环境 **216**（`config/envs.yaml`）。也可用 `PSRB_TEST_ENV=pre` 或命令行尾参 `:216` / `:pre`。

```bash
cd playwright
cp .env.example .env          # 可选；账号 itCode / clientId 见文件内注释
npm ci
npx playwright install chromium
npx playwright test --headed
```

登录为 **itCode 换 token**（无密码）。CI / 联调只需配置环境地址与 `PSRB_CLIENT_ID`（及可选账号覆盖）。

### 公共测试规则（全项目必守）

节点推进顺序、闸道解锁等与需求单无关的约定，统一放在：

- 文档：[`docs/common/`](docs/common/README.md)（当前：[`节点闸道规则.md`](docs/common/节点闸道规则.md)）
- 代码：`utils/node-order.js`

后续用例 / 脚本必须遵守；新规则按 `docs/common/README.md` 追加 `02-…`。

---

## 环境与通用传参

| 写法 | 说明 |
| --- | --- |
| 尾参 `:216` / `:217` / `:218` / `:pre` | 选环境（任意脚本 / `npx playwright test` 均可挂在末尾） |
| `PSRB_TEST_ENV=216` | 同上，环境变量优先于默认 |
| `FRONT_BASE_URL` / `ADMIN_BASE_URL` / `API_BASE_URL` | 覆盖 YAML 里的地址 |
| `PSRB_CLIENT_ID` | 登录 clientId |
| `PSRB_ACCT_SUPER_ADMIN` / `PSRB_ACCT_FRONT_OWNER` 等 | 覆盖默认 itCode（见 `utils/accounts.js`） |

`npm run xxx --` 后面的参数会原样传给 node / playwright（注意 `--` 两边空格）。

---

## 造数命令

### 4834 一键（造数 + 测）

```bash
cd playwright
npm run test:4834 -- :216       # 造数 --phase all + 页面冒烟
npm run test:4834:all -- :216   # 造数 + smoke + logic + api（全量）
```

只要造数、不测：`npm run prepare:4834 -- --phase all :216`。

### 4834（邮件提醒停点）

**页面造数**（默认）：前台建项 + 后台点审批。  
**纯 API 造数**：独立目录 [`api-datagen/`](api-datagen/README.md)。

```bash
npm run prepare:4834 -- --phase all :216
npm run prepare:4834 -- --phase approve,shape --em01 4996 --em02 4997 :216
# API：
npm run prepare:4834:api -- --phase all
```

| 参数 | 含义 | 默认 |
| --- | --- | --- |
| `--phase` | `all` / `create` / `approve` / `shape` / `advance` / `bind` | — |
| `--em01` / `--em02` | 绑定已有项目 ID | — |
| `PSRB_VERSION_PREFIX` | 版本名前缀 | — |
| `SLOW_MO` | 页面造数每步间隔 ms | `0` |

产物：`fixtures/4834/fixture_projects.json`。

### DevSecOps 优化（列表筛选 / 节点状态聚合）

文档与造数清单：[`docs/devsecops/`](docs/devsecops/README.md)。扫描包上传脚本：[`scripts/devsecops/`](scripts/devsecops/README.md)（pre 默认 `admin.csl.secx/devops/upload`）。造完回填 `fixtures/devsecops/fixture_projects.json`。

```bash
# 接口造数（3 条：Android 基线 / iOS 基线 / Windows 渗透；凭证见 scripts/devsecops/env.sh）
bash scripts/devsecops/seed_three.sh

npm run test:devsecops:logic -- :216   # 聚合规则纯逻辑（无需造数）
npm run test:devsecops -- :216         # 列表/详情冒烟（缺 fixture 会 skip）
# pre：npm run test:devsecops -- :pre
```

### 4869（矩阵停点 N07/D03/D04）

```bash
npm run prepare:4869 -- --phase create --only N07,D03,D04 :216
npm run prepare:4869 -- --phase vuln,status --only N07 :216
npm run prepare:4869 -- --phase all --only N07 :216
npm run prepare:4869 -- --phase bind --n07 5003 --d03 5004 --d04 5005
```

| 参数 | 含义 | 默认 |
| --- | --- | --- |
| `--phase` | `create` / `vuln` / `status` / `bind` / `all`（`all`=`create,vuln,status`） | `create` |
| `--only` | 逗号分隔 key：`N07` / `D03` / `D04` | `N07,D03,D04` |
| `--n07` / `--d03` / `--d04` | bind 阶段绑定已有 projectId | — |
| `PSRB_TEMPLATE_VULN_ID` | 渗透复制造洞的模板正式漏洞 id | 自动解析 |
| `PSRB_VERSION_PREFIX` | 版本名前缀 | `4869节点审批弹框` |

| Key | 含义 |
| --- | --- |
| N07（alias D01） | 渗透待审 + 多等级/六态 |
| D03 | 停在基本信息（无矩阵） |
| D04 | 渗透待审无漏洞（矩阵全 0；APR-001 会提交） |

详情：`docs/4869/README.md`。

### 全量产品组成（不要漏洞）

```bash
# 前台勾选全部产品组成 + 基本信息过审；不造威胁/漏洞
npm run datagen:components -- :216
npm run datagen:components -- :pre
```

对齐 `AT_py/造数/project_all_components.py`。组成清单见 `utils/components.js`。产物：`logs/datagen/last_project.json`（`seed_vulns=[]`）。

### 全量节点造数（datagen，含威胁/漏洞）

```bash
# 全新建项并跑完全部节点（API 优先）
SEED_EACH=1 SKIP_FRONT=1 npm run datagen:full -- --fresh :216

# 续跑指定段
npm run datagen:full -- --resume --project 5003 --from 渗透测试 :216
npm run datagen:full -- --resume --project 5003 --from 架构审核 --to 隐私安全 :216

# 强制走前台开源/基线上传（需 file/ + 已跑 auth.setup）
npm run datagen:full -- --fresh --front :216
```

| CLI 参数 | 含义 |
| --- | --- |
| `--fresh` / `--no-resume` | 新建项目（忽略 last_project） |
| `--resume` / `-r` | 续跑；配合 `--from`/`--to` 时默认续跑 |
| `--project` / `--project-id` | 续跑项目 ID |
| `--from` / `-f` | 从该节点开始（含） |
| `--to` / `-t` | 跑到该节点为止（含） |
| `--no-front` | 跳过开源/基线前台上传 |
| `--front` | 强制尝试前台上传 |

| 环境变量 | 含义 | 默认 |
| --- | --- | --- |
| `SEED_EACH` | 每个风险等级造几条 | `1` |
| `SKIP_FRONT` / `SKIP_FRONT_SEED` | 跳过前台上传 | 未设则按 CLI |
| `PROJECT_ID` | 等价于 `--project` | — |

节点顺序须服从公共闸道（G0→G1→G2）：见 [`docs/common/节点闸道规则.md`](docs/common/节点闸道规则.md)。

产物：`logs/datagen/last_project.json`。模块说明：`scripts/datagen/README.md`。

---

## 跑测试

### 快速分层（页面优先）

| 命令 | 含义 |
| --- | --- |
| `npm run test:smoke` | **默认**：前台 + 后台 UI 冒烟（有头；失败留窗） |
| `npm run test:smoke:headless` | 无头冒烟（`KEEP_BROWSER=0`） |
| `npm run test:logic` | 纯规则单测（不依赖业务环境） |
| `npx playwright test` | 默认 `CASE_SET=smoke`；全量用 `CASE_SET=all` |

**失败留窗**：默认 `KEEP_BROWSER=1` → 有头、首败停跑、`page.pause` + 终端 Enter，浏览器不关便于人工复看。关掉：`KEEP_BROWSER=0`。

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `CASE_SET` | `smoke` / `logic` / `all` | `smoke` |
| `CASE_ONLY` | 按用例 ID grep，如 `SMOKE-FP-001` | — |
| `KEEP_BROWSER` | 失败保留浏览器；`0` 关闭 | `1` |
| `HEADED` | `0` 强制无头 | 随 KEEP_BROWSER |
| `SLOW_MO` | 每步操作间隔 ms；默认正常速度；要跟画面再设如 `350` | `0` |
| `BROWSER_HOLD_SEC` | 非 TTY 时挂起秒数 | `600` |
| `RUN_CLOSE` | `1` 才跑关闭审核冒烟 | `0` |

### 4834

```bash
# 先页面造数，再跑页面冒烟（已无 API 用例）
npm run test:smoke
npm run test:4834              # 造数 + 页面冒烟
npm run test:4834:all          # 造数 + smoke + logic
npm run test:logic
npm run test:br-bc             # SMOKE-BR / SMOKE-BC（关闭需 RUN_CLOSE=1）
npm run test:4834-logic

CASE_SET=logic npx playwright test
CASE_ONLY=SMOKE-FP-001 npx playwright test
KEEP_BROWSER=0 HEADED=0 npm run test:smoke
# 需要跟画面时再减速
SLOW_MO=500 npm run test:smoke -- :216
```
### 4869

```bash
npm run prepare:4869 -- --phase all --only N07,D03,D04 :216
npx playwright test tests/4869 --project=admin --project=api :216
npx playwright test tests/4869/smoke-apr.spec.js --project=admin :216
```

| 变量 | 含义 |
| --- | --- |
| `SKIP_SUBMIT=1` | 跳过 SMOKE-APR-001 真提交 |
| `SKIP_LOOP=1` | 跳过 SMOKE-LOOP-* |

---

## CI

工作流：`.github/workflows/playwright.yml`。

| Job | 内容 | 密钥 |
| --- | --- | --- |
| `logic` | `CASE_SET=logic npx playwright test` | 无（可直接绿） |
| `e2e` | `CASE_SET=api`（默认可再开 smoke） | 见下表；需 Runner 能访问目标环境 |

在仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret / Variable | 必填 | 说明 |
| --- | --- | --- |
| `PSRB_TEST_ENV` | 建议 | 如 `216` / `pre` |
| `PSRB_CLIENT_ID` | 是（e2e） | 登录 clientId |
| `FRONT_BASE_URL` | 可选 | 覆盖 YAML |
| `ADMIN_BASE_URL` | 可选 | 覆盖 YAML |
| `API_BASE_URL` | 可选 | 默认 `{ADMIN}/api` |
| `PSRB_ACCT_SUPER_ADMIN` | 可选 | 默认 `jicq1` |
| `PSRB_ACCT_FRONT_OWNER` | 可选 | 默认 `fengtt1` |
| `RUN_E2E` | 可选 | Repository variable，设为 `true` 才跑 e2e job |

本地模拟 CI：

```bash
CI=1 CASE_SET=logic npx playwright test
CI=1 CASE_SET=api npx playwright test :216
```

---

## 其它

```bash
npm run report            # 打开 HTML 报告
npm run codegen:front     # Playwright codegen
```

| 文档 / 资产 | 路径 |
| --- | --- |
| 4834 用例说明 | `docs/4834/README.md` |
| 4869 说明 | `docs/4869/README.md` |
| 全量造数 | `scripts/datagen/README.md` |
| 用例注册表 | `fixtures/4834/cases.js` |
| 上传样例 | `file/`（可本地拷贝或软链旧目录） |
| 迁移缺口（已收口） | `docs/migration-gap.md` |

**明确不迁：** `psrb_platform/`（任务台）、`archive/`、`extras/edge-*`。
