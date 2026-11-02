# 5449 / 5325 / 4476 遗留漏洞关联修复项目编号

> **需求**：`prd/feature-5449-5325-4476.pdf`  
> **原则**：需求写明的按需求；需求未写明的按当前代码行为验收。  
> **用例正文**：[`测试用例_修复项目编号.md`](./测试用例_修复项目编号.md)

## 两套关联规则（摘要）

| 规则 | 适用节点 | 可编辑条件 | 是否必填 |
| --- | --- | --- | --- |
| **F-002** | 渗透 / 架构 / 数据 / 隐私 / AI | 本次保存状态=**已修复(3)**，且编辑前=**遗留(2)** 或操作日志曾改为遗留（content 以 ` -> 遗留` 结尾） | **选填** |
| **F-005** | 网络基础设施 | 本次审核结果=**通过(2)** | **选填** |

开源组件：**本次不调整**（既有字段与无状态限制逻辑保持原样，做回归即可）。

## 自动化（Playwright）

```bash
cd playwright

# 1) 纯逻辑（无需环境，对齐 F-002/F-005/不清空）
npm run test:5449:logic

# 2) 造数（默认只过基本信息，架构/数据/隐私/AI 保持开启可测；不再一上来免审 G1）
npm run prepare:5449 -- --fresh --phase all :216
# 若必须推进渗透闸道（会把架构等变成免审）：
npm run prepare:5449 -- --phase unlock --project-id <id> :216

# 当前 fixture 见 fixtures/5449/fixture_projects.json（含 threaten / ai / penet / network）

# 3) API（依赖 fixtures/5449/fixture_projects.json）
npm run test:5449:api -- :216

# 4) 前后台冒烟（默认有头浏览器，KEEP_BROWSER=1 失败不关窗）
npm run test:5449:smoke
# 无头：HEADED=0 KEEP_BROWSER=0 npm run test:5449:smoke

# 全量（logic → api → smoke）
npm run test:5449
```

造数：默认**前台 UI 建项**（`create-project-ui`，同 4834；`--via api` 可试模板克隆）→ API 审批解锁 G0+G1 → 挂渗透 A/B/C、威胁 A/B/C、网络 N1/N2。

## 联调报错 vs 需求对照（摘要）

详见同目录说明；核心结论：

| 现象 | 性质 | 与需求 |
| --- | --- | --- |
| 高危无法置「遗留」导致 F002-02 造数失败 | **既有遗留业务规则**（中危及以下才可遗留） | 需求 F-002 未改遗留准入；测「曾遗留」须用中/低危 |
| 已修复后再改回待修复被拒 | **既有状态机** | 需求说的是**本次保存前**改状态不清空；不是要求已落库的「已修复」必须能改回 |
| 空编号提交不擦旧值 | **代码设计**（blank→不写库） | 与需求「不自动清空」一致；若期望「可显式清空」则需求未写、代码也不支持 |
| 威胁 PUT 整包 VO / 网络 loopholeIds 格式 | **用例/调用方式问题** | 与需求无关；修调用后 API 已绿 |
| 冒烟菜单文案找不到 | **路由/菜单环境** | 与需求无关 |

需求正文未覆盖、实现按代码：AI 造数未进 prepare；威胁/AI/网络不新增列表列（需求明确不做）。

| 产物 | 路径 |
| --- | --- |
| 规则实现 | `utils/repair-project-rules.js`、`utils/repair-project-api.js` |
| 逻辑用例 | `tests/5449/logic/repair-project-rules.spec.js` |
| API 用例 | `tests/5449/api/repair-project-api.spec.js` |
| 冒烟 | `tests/5449/smoke-admin-echo.spec.js`、`smoke-front-echo.spec.js` |
| 造数 | `scripts/prepare-5449.js` → `fixtures/5449/fixture_projects.json` |

环境变量：`PSRB_5449_PROJECT_ID`、`PSRB_5449_REPAIR_CODE`、`PSRB_TEMPLATE_PROJECT_ID`（建项模板，默认与 4869 相同）。

## 代码落点（便于对应用例）

| 端 | 路径 |
| --- | --- |
| 规则 | `RepairProjectLinkRules`、`useRepairProjectOptions`、`RepairProjectSelect.vue` |
| 后台编辑 | `penetDetail` / `threatenDetail`（架构·数据·隐私） / `AISafeDetail` / `cloudInfoDetail` 审核弹窗 / `cloudInfraLoophole` 审核弹窗 / 渗透 `loopholebManager` 批量审核 |
| 前台回显 | `pentDetail` / `threatenDetail` / `AISafeDetail` / `cloudInfoDetail`（有值才展示，可跳转） |
| DB | `sec_loopholeb.repair_project`（已有）；`sec_threaten` / `sec_ai_security` / `sec_c_i_vuln` 新增列 |
| SQL | `csl-new-server/sql/update/261029/update_5449_repair_project.sql` |

## 环境建议

默认 **216**。账号沿用现有后台测试人 / 前台接口人（各节点原权限，本需求不扩权）。
