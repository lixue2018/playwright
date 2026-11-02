#!/usr/bin/env bash
# 源码 RESULT_ONLY 造数（日后用）。本次 3.6 不要执行。
#
# 不传 zip，只同步已有 Checkmarx 扫描号。scanId 必须是 pre 能拉到的号；
# 生产库的 1185234～1185241 在 pre 会拉失败，不要照抄。
# 只打 pre。

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/env.sh" ]]; then
  # shellcheck source=env.sh
  source "$SCRIPT_DIR/env.sh"
fi

# 生产 https://csl.lenovo.com/devops/upload 不要用
url="${UPLOAD_URL:-https://admin.csl.secx/devops/upload}"
ak="${SECLABAK:-}"
sk="${SECLABSK:-}"
pkg="${PACKAGE_NAME:-com.lenovo.ds.src01}"
label="${APP_NAME:-DS-源码多分支}"
it_code="${IT_CODE:-fengtt1}"

if [[ -z "${CX_SCAN_IDS:-}" ]]; then
  echo "错误:请设置 CX_SCAN_IDS，空格分隔的 pre Checkmarx scanId，例如：" >&2
  echo "  CX_SCAN_IDS='1001 1002 1003' bash scripts/devsecops/seed_source_links.sh" >&2
  exit 1
fi

read -r -a scan_ids <<< "$CX_SCAN_IDS"
branches=(main release/branch1 release/branch2 release/branch3 release/branch4 release/branch1 release/branch2 main)
builds=(JENKINS-130 JENKINS-131 JENKINS-132 JENKINS-133 JENKINS-134 JENKINS-135 JENKINS-136 JENKINS-137)

sync_one() {
  local branch="$1" build="$2" scan_id="$3"
  local ts nonce sig report
  report="https://scrp.lenovo.com.cn/CxWebClient/ViewerMain.aspx?scanId=${scan_id}"
  if ts_ns="$(date +%s%N 2>/dev/null)" && [[ "$ts_ns" != *N* ]]; then
    ts=$((ts_ns / 1000000))
  else
    ts="$(date +%s)000"
  fi
  if command -v uuidgen >/dev/null 2>&1; then
    nonce="$(uuidgen | tr 'A-Z' 'a-z')"
  else
    nonce="$(openssl rand -hex 16)"
  fi
  sig=$(printf 'AKSK_VALIDATE\n%s\n%s\n%s' "$ak" "$ts" "$nonce" | openssl dgst -sha256 -hmac "$sk" | awk '{print $NF}')
  echo "===== branch=${branch}  build=${build}  scanId=${scan_id} ====="
  curl -sS -w "\nHTTP:%{http_code}\n" "$url" \
    -H "X-AKSK-Access-Key-Id:$ak" \
    -H "X-AKSK-Timestamp:$ts" \
    -H "X-AKSK-Nonce:$nonce" \
    -H "X-AKSK-Signature:$sig" \
    -F "info={\"devopsType\":\"source\",\"scanMode\":\"RESULT_ONLY\",\"packageName\":\"${pkg}\",\"label\":\"${label}\",\"itCode\":\"${it_code}\",\"branch\":\"${branch}\",\"buildNumber\":\"${build}\",\"env\":\"jenkins\",\"checkmarxScanId\":\"${scan_id}\",\"checkmarxReportUrl\":\"${report}\"}"
  echo
  sleep 2
}

n=${#scan_ids[@]}
limit=8
if (( n < limit )); then
  limit=$n
fi
i=0
while (( i < limit )); do
  sync_one "${branches[$i]}" "${builds[$i]}" "${scan_ids[$i]}"
  i=$((i + 1))
done

echo "源码链接已推完（未立即执行）。"
