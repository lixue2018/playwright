# 造数脚本（JS）

对齐 `AT_py/造数/`。在 `playwright/` 根目录执行。

## 命令一览

```bash
# 全量产品组成 + 基本信息过审（不要漏洞）★
npm run datagen:components -- :216
npm run datagen:components -- :pre
# 建项后不过审 / 页面缺组成时跳过
npm run datagen:components -- --no-approve :216
npm run datagen:components -- --allow-missing :216

# 全新全量节点+威胁/漏洞（推荐调试：每风险 1 条、跳过前台）
SEED_EACH=1 SKIP_FRONT=1 npm run datagen:full -- --fresh :216

# 全新全量 + 尝试开源/基线上传
npm run datagen:full -- --fresh --front :216

# 续跑：从 last_project / PROJECT_ID 接着跑
npm run datagen:full -- --resume --project 5003 :216
npm run datagen:full -- --resume --project 5003 --from 渗透测试 :216
npm run datagen:full -- --resume --project 5003 --from 架构审核 --to 隐私安全 :216
npm run datagen:full -- --resume --project 5003 --from AI安全 --to 网络基础设施审核 :216

# 等价直调
node scripts/datagen/run-all-components.js :216
node scripts/datagen/run-full-nodes-all-bugs.js --fresh :216
```

尾参 `:216` / `:pre` 选环境（与其它脚本一致）。

## 全量产品组成（无漏洞）

| | |
| --- | --- |
| 命令 | `npm run datagen:components` |
| 入口 | `run-all-components.js` |
| 对齐 | `AT_py/造数/project_all_components.py` |
| 行为 | 前台勾选全部产品组成 → 提交 → 基本信息 API 过审；**不造**威胁/漏洞 |
| 组成清单 | `utils/components.js`（选件/配件按环境；`PSRB_OPTION_PART` 可覆盖） |
| 产物 | `logs/datagen/last_project.json`（`kind=project_all_components`，`seed_vulns=[]`） |

| CLI | 说明 |
| --- | --- |
| `--no-approve` | 只建项，不过审基本信息 |
| `--allow-missing` | 页面没有的组成跳过（默认缺则失败） |
| `--version <名>` | 自定义版本号 |

## CLI 参数

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--fresh` | `--no-resume` | 新建项目，不读 `last_project.json` |
| `--resume` | `-r` | 续跑已有项目 |
| `--project <id>` | `--project-id` | 指定项目 ID（续跑） |
| `--from <节点>` | `-f` | 从该节点开始（含） |
| `--to <节点>` | `-t` | 跑到该节点结束（含） |
| `--no-front` | | 跳过开源/基线前台上传 |
| `--front` | | 强制尝试前台上传（覆盖 SKIP_FRONT） |
| `--extra` | | 预留：额外闭环种子（当前默认关） |

说明：

- 写了 `--from` / `--to` 且未 `--fresh` 时，默认按续跑处理。
- `--fresh` 会清空对旧 `PROJECT_ID` 的依赖，真正新建。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `SEED_EACH` | 每个风险等级造几条 | `1` |
| `SKIP_FRONT` / `SKIP_FRONT_SEED` | `1` 则跳过前台上传 | 未设 |
| `PROJECT_ID` | 续跑项目 ID（可替代 `--project`） | — |
| `PSRB_TEMPLATE_PROJECT_ID` | 建项克隆模板 | 见 project-audit-api |
| `PSRB_TEMPLATE_VULN_ID` | 渗透 copy 模板漏洞 id | 自动解析 |
| `PSRB_TEST_ENV` | 环境（也可用尾参 `:216`） | `216` |

## 节点顺序（`--from` / `--to`）

须服从公共闸道 [`docs/common/节点闸道规则.md`](../../docs/common/节点闸道规则.md)（代码：`utils/node-order.js`）：

- **G0** 基本信息（先过审）  
- **G1** 架构审核 → 数据安全 → 隐私安全 → 源代码安全（测完再全审过）  
- **G2** 开源组件安全 → 基线安全 → 渗透测试 → AI安全 → 网络基础设施审核  
- **G3** 终审  

流水线概要：

1. 建项 + 基本信息过审（G0）  
2. 威胁 API（架构/数据/隐私）+ 改态 → 审批到源码  
3. 开源/基线前台上传（可跳过）→ 尝试审批  
4. 渗透 copy+batchInsert + 六态  
5. AI `complianceNote` + `batchInsert`  
6. 基建写 xlsx → `importData` → `frontBatchAudit`（+ 尝试 batchPass）

## 产物

`logs/datagen/last_project.json`：`project_id`、`seed_vulns`、各阶段报告。

## 模块对照

| 能力 | 文件 |
| --- | --- |
| 全量组成（无漏洞） | `run-all-components.js` + `utils/components.js` + `stages/create-project-ui.js` |
| 全量节点+漏洞入口 | `run-full-nodes-all-bugs.js` |
| 建项 / 审批 | `utils/project-audit-api.js` |
| 威胁 | `utils/threaten-api.js` |
| 渗透 | `utils/loopholeb-api.js` |
| AI | `utils/ai-compliance-api.js` |
| 基建 | `utils/cloud-infra-api.js` |
| 前台上传 | `scripts/stages/front-submit.js`（需 `file/` + `.auth/front-owner.json`） |

## 与 prepare:4869 的关系

| 场景 | 用哪个 |
| --- | --- |
| 4869 冒烟停点（N07/D03/D04） | `npm run prepare:4869` |
| 全量产品组成、只要节点骨架、不要漏洞 | `npm run datagen:components` |
| 单项目塞全节点威胁/漏洞 | `npm run datagen:full` |
