# DevSecOps 接口造数（上传扫描包）

把本目录（`scripts/devsecops`，含 `devsecops_file/`）拷走即可，不必再带 `playwright/file`。在本目录或 `playwright/` 根目录用 **Git Bash / WSL** 执行。协议与后端联调脚本一致：`info` + `file` + 四个 `X-AKSK-*` 头。

## 环境地址

编辑 [`env.sh`](./env.sh)：启用一个 `UPLOAD_URL`，注释其余。

| 环境 | 地址 |
|------|------|
| **pre（默认）** | `https://admin.csl.secx/devops/upload` |
| 生产 | `https://csl.lenovo.com/devops/upload`（**注释掉，勿用**） |
| pre 206 receive | `http://192.168.50.206:8080/loophole/tabletProject/receive`（网关 405/413 时用，需登录 token） |

AK/SK 默认写在 [`env.sh`](./env.sh)（后端联调脚本同款）；也可用环境变量 `SECLABAK` / `SECLABSK` 覆盖。**只打 pre。**

## 约定的 3 条数据

| 脚本 | 应用名 | 包名 | devopsType | 默认文件 |
|------|--------|------|------------|----------|
| `seed_baseline_android.sh` | DS-基线-Android | `com.lenovo.ds.baseline.android` | `tablet_android` | `devsecops_file/bpp_1.0.1.93.apk` |
| `seed_baseline_ios.sh` | DS-基线-iOS | `com.lenovo.ds.baseline.ios` | `tablet_ios` | `devsecops_file/flutter_ai_center.ipa` |
| `seed_win_app.sh` | DS-Windows渗透无初审 | `com.lenovo.ds.win01` | **`windows`**（应用，非 windowsDriver） | `devsecops_file/11111111评测成功.exe` |

一次请求只传一个文件；不同类型必须拆成不同项目（不同 `packageName` + 产品类型）。

## 命令

```bash
cd playwright/scripts/devsecops
# 或仍在 playwright/ 根目录：bash scripts/devsecops/seed_three.sh

# 三条一起造（推荐；AK/SK 读 env.sh）
bash seed_three.sh

# 只造其中几条
bash seed_three.sh android
bash seed_three.sh win

# 单条 / 覆盖文件
bash seed_baseline_android.sh
bash seed_win_app.sh "/path/to/other.exe"

# 临时覆盖凭证 / itCode / 地址
SECLABSK='...' IT_CODE='yourIt' bash seed_three.sh
```

## 3.6 多分支（隐私 / 基线 / 渗透）

同一项目连传 5 次，只改 `BRANCH` / `BUILD_NUMBER`，**传完再立即执行**。

| 脚本 | 文件 | 项目 |
|------|------|------|
| `seed_branch.sh android` | `devsecops_file/天骄学堂隐私基线.apk` | 基线+隐私（包名以 apk 解析为准） |
| `seed_branch.sh win` | `devsecops_file/AudioDriverSetup渗透.exe` | 新建 `com.lenovo.ds.win03`，不挂 242/244 |

`devsecops_file/设置_1.0.0060隐私静态扫描通过_基线.apk` 已放在同目录，脚本不传（留给静态检测成功）。顺序：akssk/T1 → akssk/T2 → dev/T3 → pre/T4 → dev/T5，期望扫 T2/T4/T5。

```bash
bash seed_branch.sh
bash seed_branch.sh android
bash seed_branch.sh win
```

## 源码（日后用，3.6 不要跑）

| 脚本 | 方式 | 说明 |
|------|------|------|
| `seed_source_zip.sh` | 源码 zip | 优先 `devsecops_file/csl-psirt-server-cn.zip`；没有则用 206 上 `/root/csl-psirt-server-cn.zip`；`com.lenovo.ds.src01` |
| `seed_source_links.sh` | Checkmarx 链接 | 需 **pre** 能拉到的 `CX_SCAN_IDS`，不要用生产号 |

apk/exe/ipa 都在 `devsecops_file/`。源码 zip 可拷进同目录，或仍在 206 上跑。

依赖：`bash`、`curl`、`openssl`；可选 `uuidgen`（无则用 openssl 生成 nonce）。

## 造数后

1. pre 后台核对：Android/iOS → 基线节点有日志；Windows → 渗透节点有日志。  
2. 回填 [`fixtures/devsecops/fixture_projects.json`](../../fixtures/devsecops/fixture_projects.json)。  
3. 跑冒烟：`npm run test:devsecops -- :pre`（或 `:216`）。
