# 暂停/材料定时任务模拟测试

按自然日算天数（当天 00:00 对当天 00:00）。四个 Executor 都会先调节假日接口，**周末/节假日直接跳过**。SnailJob 控制台手工触发即可，不必等 cron。

天数：

```text
pauseDays = 今天日期 − review_time 的日期
```

下文示例按 **2026-09-18** 换算。换天测试时按上式重算 `review_time`。

---

## 0. 公共前置（必看）

### 0.1 配置，不是表字段

逾期自动暂停、暂停超期关闭都会要求：

```text
sec_detection_review.review_time >= pause.process.start-time
```

默认 **`2026-09-15 00:00:00`**（Nacos / `pause.process.start-time`）。保持默认时，2026-09-18 最多只能算出 3 天，**暂停、关闭两个任务都跑不出来**。

模拟前先把 start-time 改早，例如：

```text
pause.process.start-time=2026-01-01 00:00:00
```

暂停提醒（`pauseNodeReminderExecutor`）**不看**这个配置。

### 0.2 核心表

| 表 | 用途 |
|---|---|
| `sec_detection_review` | 节点状态、算天数的 `review_time` |
| `sec_reminder_rule_project` | type=1 自动暂停天数；type=5 暂停提醒频率 / 自动关闭天数 |
| `sec_reminder_rule_node` | 规则启用的节点 |
| `sec_reminder_rule` | type=5 的 5/30/45 天发送人档位 |
| `sec_reminder_record` | 材料催办当天已发则跳过 |

### 0.3 状态码

| `review_status` | 含义 |
|---|---|
| 4 | 待提交 |
| 19 | 材料待更新 |
| 99 | 暂停测试 |
| 11 | 已关闭（终审 `location=10`） |
| `status=1` | 有效审核行（作废行是 2，不要用来测） |

---

## 1. reminderNodeExecutor（材料催办）

覆盖待提交 `4`、材料待更新 `19`。节点已是 `99` 不会入池；终审已关闭不发。

### 改哪些时间

表 **`sec_detection_review`**：

| 字段 | 改成 |
|---|---|
| `status` | `1` |
| `review_status` | `4` 或 `19` |
| `create_time` | `>= 2025-09-04 00:00:00`（SQL 入池门槛，**不算天数**） |
| `review_time` | **用来算逾期天数** |

默认 type=1 频率 **3 天**：距今天数必须是 3 的倍数（3、6、9…）。2026-09-18 测一发：

```sql
UPDATE sec_detection_review
SET review_time = '2026-09-15 10:00:00',  -- 3 天
    create_time = '2026-09-15 10:00:00'
WHERE id = {节点审核id}
  AND status = 1
  AND review_status IN (4, 19);
```

### 还要满足

- 节点必须是材料任务认的 location/second_audit（架构、数据安全、隐私、源码、基线子节点、渗透、AI 风险、红队、终审等）。
- 同项目终审：`location=10, status=1` 的 `review_status` **不能是 11**。
- 当天已发过会跳过，删记录：

```sql
DELETE FROM sec_reminder_record
WHERE project_id = {项目id}
  AND type = 'mail_reminder_node'
  AND create_time >= '2026-09-18 00:00:00'
  AND create_time <  '2026-09-19 00:00:00';
```

### 验收

- 发出材料催办邮件，模板含自动暂停倒计时。
- 节点改成 `99` 或终审改成 `11` 后再跑，不再发。

---

## 2. overdueNodeAutoPauseExecutor（逾期自动暂停）

待提交/待更新超过生效 `auto_pause_days` 后，大节点置 `99`。

### 改哪些时间

表 **`sec_detection_review`**：

| 字段 | 改成 |
|---|---|
| `status` | `1` |
| `review_status` | `4` 或 `19`（大节点或子节点都行，会抬到大节点暂停） |
| `review_time` | **>= start-time**，且天数 **> auto_pause_days** |

默认 `auto_pause_days = 7`（`sec_reminder_rule_project.type=1`）。`days <= 7` 不暂停，至少 **8 天**。2026-09-18：

```sql
UPDATE sec_detection_review
SET review_time = '2026-09-10 10:00:00'  -- 8 天，且须 >= start-time
WHERE id = {节点审核id}
  AND status = 1
  AND review_status IN (4, 19);
```

项目级覆盖：

```sql
SELECT id, project_id, auto_pause_days, status
FROM sec_reminder_rule_project
WHERE type = 1 AND (project_id = {项目id} OR project_id IS NULL);
```

### 验收

- 大节点（含子节点）变为 `99`。
- 在途申请被作废。
- 过程日志：`待提交/待更新材料超期自动暂停`。

---

## 3. pauseNodeReminderExecutor（暂停提醒）

工作日 10:00（cron 在 SnailJob，代码不写死）。按项目最长暂停天数、默认每 5 天一个频次点、单项目一封。

### 改哪些时间

表 **`sec_detection_review`**：

| 字段 | 改成 |
|---|---|
| `status` | `1` |
| `review_status` | `99` |
| `second_audit` | 大节点用 `0`（子节点不进邮件列表） |
| `review_time` | 按**该项目所有 99 节点里最长的暂停天数** |

默认 type=5 频率 **5**：最长天数是 5、10、15… 才发。2026-09-18：

```sql
-- 5 天，发一封
UPDATE sec_detection_review
SET review_time = '2026-09-13 10:00:00'
WHERE id = {暂停节点审核id} AND status = 1 AND review_status = 99;

-- 30 天，升级抄送
-- review_time = '2026-08-19 10:00:00'

-- 45 天，再升一档
-- review_time = '2026-08-04 10:00:00'
```

**不看** `pause.process.start-time`。

### 还要满足

- 终审 `location=10` 不能是 `11`。
- type=5 规则启用，节点在规则里打开：

```sql
SELECT * FROM sec_reminder_rule_project WHERE type = 5 AND status = 1;
SELECT * FROM sec_reminder_rule_node WHERE rule_project_id = {规则id} AND status = 1;
```

### 验收

- 同一项目一封邮件，最多列出 5 个大节点。
- 非 5 的倍数天数不发。

---

## 4. pausedProjectAutoCloseExecutor（暂停超期关项目）

任一节点 `99` 且最长暂停天数 **> auto_close_days** 则关项目。

### 改哪些时间

表 **`sec_detection_review`**：

| 字段 | 改成 |
|---|---|
| `status` | `1` |
| `review_status` | `99`（任一节点即可） |
| `review_time` | **>= start-time**，且最长天数 **> auto_close_days** |

默认 `auto_close_days = 60`（`sec_reminder_rule_project.type=5`）。`days <= 60` 不关，至少 **61 天**。2026-09-18：

```sql
UPDATE sec_detection_review
SET review_time = '2026-07-19 10:00:00'  -- 61 天，且须 >= start-time
WHERE id = {暂停节点审核id}
  AND status = 1
  AND review_status = 99;
```

### 验收

- 在途申请作废。
- 终审关闭级联。
- `cloneAllVulnerability`。
- 过程日志：`节点暂停超期自动关闭`。

暂停提醒和自动关闭都靠 99 的 `review_time`，**不要同一条记录同时测 5 天和 61 天**。改完时间再分别跑对应 Executor。

---

## 5. 建议造数（同一项目拆开测）

| 节点 | `review_status` | `review_time`（相对 2026-09-18） | 用来验 |
|---|---|---|---|
| A 待提交/待更新 | 4 或 19 | 2026-09-15（3 天） | 材料催办 |
| B 待提交/待更新 | 4 或 19 | 2026-09-10（8 天） | 自动暂停 |
| C 已暂停 | 99 | 2026-09-13（5 天） | 暂停提醒 |
| C 再改时间 | 99 | 2026-07-19（61 天） | 自动关闭 |

漏洞催办不用改时间来制造“跳过”：对应节点改成 `99`，或终审改成 `11`，任务会直接跳过。

---

## 6. 手工触发顺序

1. 改 Nacos `pause.process.start-time`（测暂停/关闭时）。
2. 改 `sec_detection_review` 的 `review_time` / `review_status`。
3. 确认当天是工作日。
4. SnailJob 分别点：

| Executor | 名称 |
|---|---|
| 材料催办 | `reminderNodeExecutor` |
| 逾期自动暂停 | `overdueNodeAutoPauseExecutor` |
| 暂停提醒 | `pauseNodeReminderExecutor` |
| 暂停超期关闭 | `pausedProjectAutoCloseExecutor` |

材料催办与逾期暂停可同一天、同一批 `4/19` 数据，但天数门槛不同（3 的倍数 vs >7），不要指望一条 `review_time` 两个任务都命中。
