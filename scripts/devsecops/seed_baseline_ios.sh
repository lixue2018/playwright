#!/usr/bin/env bash
# 造数：基线 iOS（一条数据，一个 ipa）
# bash scripts/devsecops/seed_baseline_ios.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE_DIR="$SCRIPT_DIR/devsecops_file"

export DEVOPS_TYPE="${DEVOPS_TYPE:-tablet_ios}"
export APP_NAME="${APP_NAME:-DS-基线-iOS}"
export PACKAGE_NAME="${PACKAGE_NAME:-com.lenovo.ds.baseline.ios}"
export BUILD_NUMBER="${BUILD_NUMBER:-DS-BASELINE-IOS-1}"
export MIME="${MIME:-application/octet-stream}"

file="${1:-$FILE_DIR/flutter_ai_center.ipa}"
exec bash "$SCRIPT_DIR/upload_artifact.sh" "$file"
