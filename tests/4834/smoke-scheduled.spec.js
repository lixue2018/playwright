// @ts-check
/**
 * 调度类冒烟：对齐 Python skip，入库占位不硬做。
 */
const { test } = require('@playwright/test');

test.describe('调度类冒烟（需定时任务）', () => {
  test.fixme('SMOKE-AP-001 超期自动暂停', async () => {
    // 需 overdueNodeAutoPauseExecutor；且不回溯上线前历史超期
  });

  test.fixme('SMOKE-PM-001 暂停节点邮件提醒', async () => {
    // 需非法定假日 10:00 / pauseNodeReminderExecutor（含普通周末应发）
  });

  test.fixme('SMOKE-AC-001 超长暂停自动关闭', async () => {
    // 需暂停天数 > autoCloseDays；不回溯上线前历史暂停超长
  });

  test.fixme('SMOKE-TODO-001 待办默认节点申请类型', async () => {
    // 需后台待办页验「节点申请类型」默认条件组
  });
});
