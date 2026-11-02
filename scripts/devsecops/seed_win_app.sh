#!/usr/bin/env bash
# 造数：Windows 应用渗透（devopsType=windows，一条数据，一个 exe）
# bash scripts/devsecops/seed_win_app.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE_DIR="$SCRIPT_DIR/devsecops_file"

export DEVOPS_TYPE="${DEVOPS_TYPE:-windows}"
export APP_NAME="${APP_NAME:-DS-Windows渗透无初审}"
export PACKAGE_NAME="${PACKAGE_NAME:-com.lenovo.ds.win01}"
export BUILD_NUMBER="${BUILD_NUMBER:-DS-WIN01-1}"
export MIME="${MIME:-application/x-msdownload}"

file="${1:-$FILE_DIR/11111111评测成功.exe}"
exec bash "$SCRIPT_DIR/upload_artifact.sh" "$file"
