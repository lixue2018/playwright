# api-datagen — 纯 API 造数（与页面造数分离）

> **目录约定**：本文件夹只放**直接调业务接口**的造数脚本。  
> 页面造数 / 冒烟仍在 `scripts/prepare-4834.js`、`npm run prepare:4834`、`npm run test:smoke`。

在 `playwright/` 根目录执行下列命令。

---

## 与页面造数对照

| | 页面 | 本目录（API） |
| --- | --- | --- |
| 命令 | `npm run prepare:4834` | `npm run prepare:4834:api` |
| 入口 | `scripts/prepare-4834.js` | `api-datagen/prepare-4834.js` |
| 建项 | 前台浏览器新建 | 克隆模板 `createProjectFromTemplate` |
| 审批 | 后台页面点审批 | `audits` 接口 |
| 读节点态 | 打开前台拦截 `getNavStatus` | `getNavStatus` 直调 |
| 推进闸道 advance | 支持 | **不支持**（请用页面） |

状态池规则仍适用：默认不免审烧左侧；`PREPARE_SACRIFICE_LEFT=1` 才免审挤下一节点。  
详见 `docs/4834/造数状态池与用例消耗.md`。

---

## 4834 邮件提醒造数

```bash
# 全新：建项 + 基本信息通过 + 打 pause_ok / paused
PSRB_TEST_ENV=216 npm run prepare:4834:api -- --phase all

# 复用旧项目
PSRB_TEST_ENV=216 npm run prepare:4834:api -- --phase approve,shape --em01 5046 --em02 5047

# 停在闸道（全量中间态）
PSRB_TEST_ENV=216 npm run prepare:4834:api -- --stop-at-gate g1

# 钉死节点
PSRB_TEST_ENV=216 npm run prepare:4834:api -- --focus-node 数据安全 --phase all

# 直调
node api-datagen/prepare-4834.js --phase all
```

| 参数 / 环境变量 | 说明 |
| --- | --- |
| `--phase` | `all` / `create` / `approve` / `shape` / `bind` |
| `--em01` / `--em02` | 绑定已有项目编号 |
| `--stop-at-gate` | `g0` \| `g1` |
| `--focus-node` / `PSRB_FOCUS_NODE` | 钉死节点 |
| `PSRB_TEMPLATE_PROJECT_ID` | API 克隆模板项目（默认见 `utils/project-audit-api.js`） |
| `PREPARE_SACRIFICE_LEFT=1` | 允许免审左侧（会造终态） |

产物与页面造数相同：`FIXTURE_PATH` / `fixtures/4834/fixture_projects.json`。

---

## 全量产品组成 / 全量节点造数（已有脚本）

仍在 `scripts/datagen/`：

```bash
# 全量产品组成 + 基本信息过审（不要漏洞）
npm run datagen:components -- :216

# 全量威胁/漏洞造数（API 优先）
SEED_EACH=1 SKIP_FRONT=1 npm run datagen:full -- --fresh :216
```

说明见 `scripts/datagen/README.md`。后续若继续收拢，可再迁入本目录。

---

## 文件结构

```text
api-datagen/
  README.md                 ← 本说明
  prepare-4834.js           ← 4834 CLI
  lib/prepare-4834-api.js   ← create / approve / shape（纯 API）
```
