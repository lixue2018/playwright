# 4869 节点审批漏洞矩阵（Playwright）

闭环审批 + 矩阵/抽屉冒烟已入库。日常请用本目录命令（旧 `AT_py` 仅历史对照）。

**公共规则**：节点闸道（G0→G1→G2→G3，测完再审过）见 [`docs/common/节点闸道规则.md`](../common/节点闸道规则.md)。

## 造数命令

```bash
cd playwright

# 建项 + 前置审批（N07/D03/D04）
npm run prepare:4869 -- --phase create --only N07,D03,D04 :216

# 仅 N07：渗透造洞 + 六态
npm run prepare:4869 -- --phase vuln,status --only N07 :216

# 一次跑完（create → vuln → status）
npm run prepare:4869 -- --phase all --only N07 :216

# 绑定已有项目（不新建）
npm run prepare:4869 -- --phase bind --n07 5003 --d03 5004 --d04 5005
```

| 参数 | 含义 | 默认 |
| --- | --- | --- |
| `--phase` | `create` / `vuln` / `status` / `bind` / `all` | `create` |
| `--only` | `N07,D03,D04` 等 | `N07,D03,D04` |
| `--n07` / `--d03` / `--d04` | bind 用的 projectId | — |
| 尾参 `:216` | 环境 | 默认 216 |
| `PSRB_TEMPLATE_VULN_ID` | 复制造洞模板正式漏洞 id | 自动 |

| Key | 含义 |
| --- | --- |
| **N07**（alias D01） | 渗透待审 + 多等级/六态 |
| **D03** | 基本信息（无矩阵） |
| **D04** | 渗透待审无漏洞（APR-001 会提交推进节点） |

全量多节点造数见：`npm run datagen:full`（`scripts/datagen/README.md`）。

## 冒烟命令

```bash
# 全量 4869（admin UI + api）
npx playwright test tests/4869 --project=admin --project=api :216

# 单文件示例
npx playwright test tests/4869/smoke-loop.spec.js --project=admin :216
```

| 变量 | 含义 |
| --- | --- |
| `SKIP_SUBMIT=1` | 跳过 SMOKE-APR-001 |
| `SKIP_LOOP=1` | 跳过 SMOKE-LOOP-* |

| 文件 | 覆盖 |
| --- | --- |
| `smoke-api-matrix.spec.js` | TC-API-001 / SMOKE-API-001 |
| `smoke-new-001.spec.js` | SMOKE-NEW-001 / TC-NEW-003 |
| `smoke-new-002-003.spec.js` | SMOKE-NEW-002 / 003 |
| `smoke-drw.spec.js` | SMOKE-DRW-001 / 002 / 004 |
| `smoke-apr.spec.js` | SMOKE-APR-001 / 002 |
| `smoke-loop.spec.js` | SMOKE-LOOP-001 / 002 |
| `smoke-mtx.spec.js` | TC-MTX-004 / 005 / 008 |
