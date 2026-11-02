# DevSecOps 优化相关需求（开发分支）— Playwright 用例与造数

> 分支：`feature/devsecops优化相关需求`  
> 覆盖：5007 多分支 + 隐私/基线/渗透批次聚合 · 4939 未开启/任务ID/节点筛选 · 列表待修复数 · 5236 按节点收件人 · Windows 渗透取消初审 · 5202/5245 源码批次（回归）  
> 环境：216 / pre（`npm run test:devsecops -- :216` 或 `:pre`）  
> 造数：扫描包走接口上传（见 [造数清单.md](./造数清单.md)；脚本 [`scripts/devsecops/`](../../scripts/devsecops/README.md)）

## 接口造数（pre 三条）

地址默认 **pre**：`https://admin.csl.secx/devops/upload`（切换见 `scripts/devsecops/env.sh`）。

| 数据 | 应用名 | 包名 | devopsType | 文件 |
|------|--------|------|------------|------|
| 基线 Android | DS-基线-Android | `com.lenovo.ds.baseline.android` | `tablet_android` | `bpp_1.0.1.93.apk` |
| 基线 iOS | DS-基线-iOS | `com.lenovo.ds.baseline.ios` | `tablet_ios` | `flutter_ai_center.ipa` |
| Windows 渗透 | DS-Windows渗透无初审 | `com.lenovo.ds.win01` | `windows` | `11111111评测成功.exe` |

```bash
cd playwright
bash scripts/devsecops/seed_three.sh   # AK/SK 默认在 scripts/devsecops/env.sh
```

说明见 [`scripts/devsecops/README.md`](../../scripts/devsecops/README.md)。造完回填 `fixtures/devsecops/fixture_projects.json`。

## 本期用户可见改动（验收要点）

| 编号 | 能力 | 页面/接口 |
|------|------|-----------|
| 4939 | 节点无扫描记录 → **未开启**；详情展示扫描任务 ID | 列表/详情 |
| 4939/列表 | **节点+状态**多选筛选（跨节点 OR，同节点多状态 OR）；隐私多「静态检测成功」 | `NodeStatusFilter` → `tabletProject/list` |
| 5007 | 隐私/基线/渗透：最新一批 = 非空 `scan_batch_id` 最大 id 所在批；按批聚合状态 | 列表列 + 详情节点态 |
| 5007 | 多分支：同项目多 `code_branch` 可并存；忙状态禁止再开一轮 | 收包 + 列表 |
| 展示 | 节点列文案 `状态(待修复数)`；数量**只计待修复(1)**；未开启/等待扫描/扫描中/扫描失败 为 `-` | 列表导出同规则 |
| Windows | 渗透 **取消初审**，新洞直接待修复，并开修复待办 | 渗透详情/待办 |
| 5236 | 邮件/待办收件人按节点管理人员拆分 | 邮件发送记录 |
| 5202 | 源码 CheckMarx/Coverity 批次、扫描编号筛选（已有 `docs/5202`，本包做冒烟回归） | 源码节点 |

## 状态码（plat_status）

| code | 文案 | 备注 |
|------|------|------|
| 8 | 未开启 | 该节点 **无** 扫描日志（筛选用 8；库内 status 常为 null） |
| 0 | 等待扫描 | |
| 7 | 扫描中 | 优先于待人工审核 |
| 1 | 待人工审核 | 有待处理洞，且尚未人工改状态 |
| 2 | 审核中 | 有待处理洞 + 已人工改状态，或日志已是审核中 |
| 3 | 漏洞待修复 | 仅统计待修复/待评估；列表「待修复数」只计此类 |
| 4 | 扫描通过 | 混合失败+通过 → 通过；失败+0 洞 → 通过 |
| 5 | 扫描失败 | 本批 **全部** 失败 |
| 6 | 静态检测成功 | **仅隐私**；基线同状回落为扫描通过 |

隐私/基线/渗透聚合优先级见 `TabletNodeStatusAggregator`：  
未开启 → 等待扫描 → 扫描中 → 待人工审核/审核中 → 漏洞待修复 → 扫描通过 → 扫描失败 → 静态检测成功(仅隐私)。

源码节点另走 `TabletSourceNodeStatusAggregator`（按 `scan_cycle`，失败不拖死另一工具）。

## 用例 ID 一览

| ID | 类型 | 说明 | 依赖 fixture |
|----|------|------|--------------|
| SMOKE-DS-LIST-001 | 页面 | 列表打开 + 节点状态筛选控件可见 | 无 |
| SMOKE-DS-LIST-002 | 页面 | 筛「未开启」命中 OFF01 | OFF01 |
| SMOKE-DS-LIST-003 | 页面 | 筛「审核中」命中 REV01；隐私可筛「静态检测成功」 | REV01 / STATIC01 |
| SMOKE-DS-LIST-004 | 页面 | 列表节点列展示 `状态(` 或 `-` | FIX01 / OFF01 |
| SMOKE-DS-DET-001 | 页面 | 详情无扫描节点为未开启；有扫描展示任务 ID | OFF01 / FIX01 |
| SMOKE-DS-DET-002 | 页面 | 隐私 STATIC01 节点文案含静态检测成功 | STATIC01 |
| SMOKE-DS-WIN-001 | 页面 | Windows 渗透详情无「初审」入口/文案 | WIN01 |
| SMOKE-DS-SRC-001 | 页面 | 源码多工具项目可见报告区 | SRC01 |
| LOGIC-DS-AGG-* | logic | 聚合优先级纯函数（对齐 Java 单测） | 无 |

## 运行

```bash
cd playwright
# 造数完成后填写 fixtures/devsecops/fixture_projects.json
npx playwright test --project=admin --grep "SMOKE-DS" :216
npx playwright test --project=logic --grep "LOGIC-DS" :216
# 或
npm run test:devsecops -- :216
```
