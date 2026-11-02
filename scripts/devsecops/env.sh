#!/usr/bin/env bash
# DevSecOps 上传环境（只用其中一个 UPLOAD_URL，其余保持注释）。
# 由 upload_artifact.sh / seed_three.sh source，也可单独：
#   source scripts/devsecops/env.sh && echo "$UPLOAD_URL"
#
# 环境隔离靠「网关地址 + 该环境 AK/SK」，不是 info.env 字段。
# SK 切勿写入本文件；用环境变量 SECLABSK（或 SK）。

# ---------- 上传地址：启用一行，注释其他 ----------
# 生产（勿用于本次 pre 造数）
# UPLOAD_URL="${UPLOAD_URL:-https://csl.lenovo.com/devops/upload}"

# pre（本次默认）
UPLOAD_URL="${UPLOAD_URL:-https://admin.csl.secx/devops/upload}"

# 216 内网直连 receive（仅 AccessKey 头时后端另有约定，一般不用）
# UPLOAD_URL="${UPLOAD_URL:-http://192.168.50.216/api/loophole/tabletProject/receive}"

# pre 206 直连 receive（网关 /devops/upload 是静态页会 405；大包绕开 nginx 100m）
# UPLOAD_URL="${UPLOAD_URL:-http://192.168.50.206:8080/loophole/tabletProject/receive}"

# ---------- Access Key / Secret Key（可用环境变量覆盖）----------
# 来自后端联调脚本默认值；若签名失败请向后端索取与当前网关配对的一对
# 注意：SK 勿提交到公共/生产仓库；本文件仅本仓造数联调使用
SECLABAK="${SECLABAK:-${AK:-}}"
SECLABSK="${SECLABSK:-${SK:-}}"

# ---------- 默认元数据（各 seed 脚本可再覆盖）----------
JOB_NAME="${JOB_NAME:-jenkins_devsecops_seed}"
BRANCH="${BRANCH:-main}"
IT_CODE="${IT_CODE:-fengtt1}"
