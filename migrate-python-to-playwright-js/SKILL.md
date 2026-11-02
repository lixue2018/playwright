---
name: migrate-python-to-playwright-js
description: 将现有的 Python 自动化测试脚本，完整翻译并迁移为 Playwright (JavaScript) + @playwright/test。保留原有业务逻辑，结合 Vue 前端和后端代码完善元素定位器、接口调用和断言。解决旧脚本定位不准的问题，产出符合现代前端规范的 JS 测试代码。
---

# 自动化测试迁移：Python 转 Playwright (JavaScript)

## 1. 目标与技术约束

将旧的 Python 自动化脚本逻辑完整翻译为可维护的 Playwright JavaScript 测试。

固定使用：
- JavaScript (Node.js) 或 TypeScript (按项目规范)
- Playwright 官方测试运行器 `@playwright/test`
- Playwright Web-First Assertions (`expect`)

禁止：
- 生成 Python 测试代码。
- 使用 Selenium、Puppeteer 或 Cypress。
- 仅替换点击语法而遗漏原 Python 脚本中的数据准备、业务流程和断言。
- 遗漏原代码中的 API 请求（需转换为 Playwright 的 `request` API）。
- 未执行测试就宣称测试通过。
- 覆盖旧 Python 脚本（应保留作参考，新代码放独立目录）。

## 2. 第一阶段：分析旧 Python 脚本逻辑

仔细阅读旧的 Python 脚本、fixture、配置文件和公共函数。
理解并记录：
1. 登录与鉴权方式（UI 登录还是 API 获取 Token）。
2. 前置数据准备逻辑（数据库操作、API 请求等）。
3. 核心业务操作步骤流。
4. 原有的断言预期。
5. 存在的痛点（如 `time.sleep`、复杂的 XPath）。

产出 `docs/migration-plan.md`，列出所有待迁移的 Python 用例及其对应的 JS 测试规划。

## 3. 第二阶段：结合 Vue 项目重构定位器

不要盲目照搬 Python 里的老旧 XPath。结合前端（Vue）仓库代码：
- 分析 Vue 组件（`<template>`）、路由和状态。
- 使用 Playwright 推荐的现代定位器，优先级顺序：
  1. `page.getByRole()` (配合 `name`)
  2. `page.getByLabel()`
  3. `page.getByTestId()` (如 Vue 中已有 `data-testid`)
  4. `page.getByPlaceholder()` / `page.getByText()`
  5. 稳定的 CSS 选择器
- **禁止在 JS 中写机械的 `page.waitForTimeout(3000)`**，必须依赖 Playwright 的自动等待和 `await expect(locator).toBeVisible()`。

## 4. 第三阶段：设计 Playwright JS 项目结构

采用标准的 Playwright Node.js 工程结构：

```text
e2e-tests/
├── playwright.config.js    # 全局配置 (baseURL, projects, 等)
├── package.json            # 依赖管理
├── .env.example            # 环境变量示例
├── tests/
│   ├── auth.setup.js       # 登录状态保存逻辑 (可选)
│   └── login.spec.js       # 测试用例
├── utils/
│   └── api-helper.js       # 翻译自 Python requests 的 API 工具
└── docs/
    └── migration-plan.md
```

## 5. JavaScript 代码编写规范

- **异步处理**：正确使用 `async / await`。Playwright 的所有动作（`click`, `fill`, `expect`）都必须加 `await`。
- **测试结构**：使用 `test.describe()`, `test.beforeEach()`, `test()` 组织代码。
- **断言**：使用原生的 `@playwright/test` 断言。
  ✅ `await expect(page.getByText('成功')).toBeVisible();`
- **网络接口映射**：原 Python 中用 `requests` 发送的前置数据请求，使用 `const response = await request.post(...)` 替代。

代码示例：
```javascript
const { test, expect } = require('@playwright/test');

test.describe('用户管理模块', () => {
  test('新增用户成功', async ({ page }) => {
    await page.goto('/users');

    // 点击新增按钮
    await page.getByRole('button', { name: '新增用户' }).click();

    // 填写表单
    const dialog = page.getByRole('dialog', { name: '新增' });
    await dialog.getByLabel('用户名').fill('test_user');
    await dialog.getByRole('button', { name: '保存' }).click();

    // 验证成功提示及表格数据
    await expect(page.getByText('保存成功')).toBeVisible();
    await expect(page.getByRole('row', { name: 'test_user' })).toBeVisible();
  });
});
```

## 6. 数据隔离与登录优化

- 默认配置 `playwright.config.js` 中的 `use: { storageState: '...' }` 来复用登录状态（如 Cookie/Token），避免每个用例都走一遍 UI 登录。
- 对于前后端分离 Vue 项目，注意 localStorage / sessionStorage 里的 Token 管理。

## 7. 迁移与执行验证步骤

1. **环境初始化**：生成 `package.json` 和 `playwright.config.js`。
2. **单例迁移**：挑选一个原 Python 测试，翻译为 JS。
3. **本地运行验证**：
   使用命令 `npx playwright test tests/your_test.spec.js --headed` 运行。
   如果失败，利用 Cursor 工具分析报错、截图或 Trace 记录。
4. **调整完善**：根据 Vue 真实渲染的 DOM 修正定位器，直到测试稳定通过。
5. **批量迁移**：单例跑通后，按模块批量翻译剩余的 Python 测试。

## 8. 交付结果

完成一个模块后，总结：
- 翻译了哪些 Python 脚本。
- 废弃了哪些无效的旧逻辑。
- 实际执行 `npx playwright test` 的结果。
- 如果 Vue 前端缺乏可定位属性，给出修改 Vue 源码补充 `data-testid` 的建议。