# 4834 邮件提醒流程变更

对齐用例文档：

- **公共规则（全项目）**：[`docs/common/节点闸道规则.md`](../common/节点闸道规则.md)
- 全量/冒烟对照：`测试用例_邮件提醒流程变更_20260914.md`
- **人工测试（推荐）**：`测试用例_人工执行_按路径归拢.md`（按：邮件配置 → 各节点状态申请暂停 → 自动发信 归拢）

造数**不造威胁/漏洞**，只建项目并把节点打成用例需要的状态。

在 `playwright/` 根目录执行下列命令（勿再使用 `AT_py` 的 `prepare_data.py` / `run_4834.py`）。

## 执行原则（重要）

1. **用例与冒烟一律页面操作**：申请/审批/邮件配置与发送记录都走浏览器。  
2. **页面造数**用 `npm run prepare:4834`；**禁止**在页面入口加 `--via api`。  
3. **纯 API 造数**只放在根目录 [`api-datagen/`](../../api-datagen/README.md)，命令：`npm run prepare:4834:api`。  
4. 角色按真实 itCode 登录；禁止全程超管冒充审核（CFG / 查发送记录除外）。  
5. **节点闸道** + **状态池**：见闸道规则与 [`造数状态池与用例消耗.md`](./造数状态池与用例消耗.md)。  
6. 登录换账号可用 token 注入；页面造数读节点态靠拦截前台自身的 `getNavStatus`。

## 浏览器窗口（重要）

- **同一进程只开一个 Chrome 窗口**；换账号 / 换前后台用**新标签页**，不要 `newContext`（每个 Context ≈ 新窗口）。
- 造数 `prepare-4834`（UI）与 `newAuthedPage` 已按此实现。
- `KEEP_BROWSER=1`：失败时保留当前标签；成功会关掉该标签，窗口留给后续步骤。

### 2026-09-15 PRD 评审口径（脚本已对齐）

- 暂停邮件：**工作日+周末发**，只跳**法定假**；详情链 → 前台**基本信息**。
- AP/AC：**不回溯**上线前历史超期/超长。
- 最长暂停：实时按仍暂停节点（例隐私9/渗透5/基线已恢复→9）。
- 暂停后：节点审批仅「审核重启」；前台仅「申请恢复测试」。
- 待办：默认「节点申请类型」三类全选，与状态**或**关系。

## 角色 itCode（216）

写在 `utils/accounts.js` 与 `fixtures/4834/fixture_projects.json` → `accounts`，环境变量可覆盖。

| 角色 | itCode | 环境变量 |
| --- | --- | --- |
| 超管 / 邮件管理员 | `jicq1` | `PSRB_ACCT_SUPER_ADMIN` |
| 本项目前台接口人 | `fengtt1` | `PSRB_ACCT_FRONT_OWNER` / `PSRB_FRONT_USER` |
| 他项目接口人 | `shaoyp3` | `PSRB_ACCT_OTHER_OWNER` |
| 无 interface_user | `tianmq1` | `PSRB_ACCT_NO_INTERFACE` |
| 各节点审核人/Backup | 见 fixture `node_auditors` | — |

冒烟登录切换：

- CFG-001：列表点 **系统预设规则**（新标签）→ 切「项目节点暂停邮件提醒」→ 验最终处理 60 天  
- CFG-002：列表点 **新增项目提醒**（文档亦称新增项目规则，新标签 add/0）→ 选暂停场景；前台弹窗核对天数  
- 前台申请（FP/FR/FC）→ `fengtt1`  
- 后台审核（BP/BR/BC）→ 对应节点主审，必要时 Backup  
- 查邮件发送记录 → `jicq1`  
- AUTH：`tianmq1` 前台 + 异节点审核人后台看按钮

## 邮件验证（不看真实邮箱）

浏览器打开后台 **系统管理 → 邮件发送记录**（`/admin/system/sendRecord`），按邮件名称查询，核对发送人列表 / 抄送人列表。

申请暂停通知约定：**To=审核人+Backup，CC=接口人**。

## 造数

默认 **页面造数**。**状态池**：EM01=`pause_ok`（不免审）、EM02=`paused`；详见 [`造数状态池与用例消耗.md`](./造数状态池与用例消耗.md)。

```bash
cd playwright

# 推荐：基本信息通过 + 标记可暂停 / 置暂停（不烧左侧）
npm run prepare:4834 -- --phase all :216

# 全量测中间态：停在闸道边界（勿过早 shape / advance）
npm run prepare:4834 -- --stop-at-gate g0 :216   # 只建项，测基本信息
npm run prepare:4834 -- --stop-at-gate g1 :216   # 基本信息已过，留下 G1 四节点中间态

# 单节点闭环造数（仍不免审兄弟节点）
npm run prepare:4834 -- --focus-node 数据安全 :216

# 仅当明确放弃左侧中间态时：免审挤下一节点（旧最短路径）
PREPARE_SACRIFICE_LEFT=1 npm run prepare:4834 -- --phase all :216

# 本闸用例全部勾完后，才推进闸道（不可逆）
npm run prepare:4834 -- --phase advance --advance-gate g1 --em01 5042 --em02 5043 :216

# 纯 API 造数（独立目录 api-datagen/，与页面分离）
npm run prepare:4834:api -- --phase all
# 详见 api-datagen/README.md

# 复用旧项目（跳过建项，只审批+打状态）
npm run prepare:4834 -- --phase approve,shape --em01 4987 --em02 4986 :216

# 只绑定 fixture
npm run prepare:4834 -- --phase bind --em01 4987 --em02 4986
```

产物：`fixtures/4834/fixture_projects.json`（含 `node_gates` / `node_roles` / `focus_node`）。

## 跑用例

```bash
# 冒烟（页面）
npm run test:smoke

# 钉死节点再冒烟
PSRB_FOCUS_NODE=数据安全 npm run test:smoke

# 纯函数 logic（无浏览器）
npm run test:logic
```