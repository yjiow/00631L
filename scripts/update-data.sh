#!/usr/bin/env bash
# 從證交所補抓新交易日，追加至 public/data/<代號>.json 並重算 adjClose
# 用法：bash scripts/update-data.sh [資料夾，預設 public/data]
# 依賴：curl、jq、awk
set -euo pipefail

DATA_DIR="${1:-public/data}"
UA="Mozilla/5.0 (compatible; yj00631-updater)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NOW_YM="$(TZ=Asia/Taipei date +%Y%m)"
NOW_Y="$(TZ=Asia/Taipei date +%Y)"

fetch() { # url → stdout（失敗重試 3 次）
    local i
    for i in 1 2 3; do
        if curl -fsS -A "$UA" --max-time 30 "$1"; then return 0; fi
        sleep 5
    done
    return 1
}

# 除權息參考價：TWT49U（整年）→ 代號|YYYY-MM-DD|參考價
for y in $((NOW_Y - 1)) "$NOW_Y"; do
    fetch "https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${y}0101&endDate=${y}1231&response=json" > "$TMP/ex.json"
    sleep 3
    jq -r 'select(.stat == "OK") | .data[] | [.[1], .[0], .[4]] | join("|")' "$TMP/ex.json" |
        awk -F'|' '{ split($2, a, /[年月日]/); printf "%s|%04d-%s-%s|%s\n", $1, a[1] + 1911, a[2], a[3], $3 }'
done > "$TMP/exref.txt"

for CODE in 0050 00631L; do
    FILE="$DATA_DIR/$CODE.json"
    LAST="$(grep -o '"date":"[0-9-]*"' "$FILE" | tail -1 | cut -d'"' -f4)"

    # 最後交易日所在月份 ~ 本月，逐月抓 STOCK_DAY → YYYY-MM-DD|收盤|漲跌價差
    : > "$TMP/new.txt"
    ym="${LAST:0:4}${LAST:5:2}"
    while [ "$ym" -le "$NOW_YM" ]; do
        fetch "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ym}01&stockNo=${CODE}&response=json" > "$TMP/m.json"
        sleep 3
        jq -r 'select(.stat == "OK") | .data[] | [.[0], .[6], .[7]] | join("|")' "$TMP/m.json" |
            awk -F'|' -v last="$LAST" '{
                split($1, a, "/"); d = sprintf("%04d-%s-%s", a[1] + 1911, a[2], a[3])
                gsub(/,/, "", $2)
                if (d > last && $2 ~ /^[0-9.]+$/) print d "|" $2 "|" $3
            }' >> "$TMP/new.txt"
        y="${ym:0:4}"; m=$((10#${ym:4:2} + 1))
        if [ "$m" -gt 12 ]; then m=1; y=$((y + 1)); fi
        ym="$(printf '%04d%02d' "$y" "$m")"
    done

    if [ ! -s "$TMP/new.txt" ]; then echo "${CODE}：無新資料（最後 ${LAST}）"; continue; fi

    grep "^$CODE|" "$TMP/exref.txt" | cut -d'|' -f2,3 > "$TMP/ex_code.txt" || true

    # 新交易日漲跌幅（除息日 X 開頭用 收盤 ÷ 參考價 − 1，其餘 價差 ÷ 前收），
    # 由最新一日（adjClose = close）往回推，舊資料 adjClose 依比例 f 縮放
    awk -v CONVFMT="%.10g" '
        FILENAME ~ /ex_code/ { ex[substr($0, 1, 10)] = substr($0, 12); next }
        FILENAME ~ /new\.txt/ {
            split($0, f, "|"); n++; D[n] = f[1]; C[n] = f[2]; diff = f[3]
            if (diff ~ /X/) P[n] = f[2] / ex[f[1]] - 1
            else { gsub(/[+ ]/, "", diff); P[n] = diff / (f[2] - diff) }
            next
        }
        { rows[++r] = $0 }
        END {
            A[n] = C[n]
            for (i = n; i > 1; i--) A[i - 1] = A[i] / (1 + P[i])
            prevA = A[1] / (1 + P[1])
            # 舊檔最後一列
            for (i = r; i > 0; i--) if (rows[i] ~ /adjClose/) { lastRow = i; break }
            match(rows[lastRow], /"adjClose":[0-9.e+-]+/)
            oldA = substr(rows[lastRow], RSTART + 11, RLENGTH - 11) + 0
            k = prevA / oldA
            scale = (k - 1 > 1e-9 || 1 - k > 1e-9)
            for (i = 1; i <= r; i++) {
                line = rows[i]
                if (line ~ /^\]/) continue
                if (scale && match(line, /"adjClose":[0-9.e+-]+/)) {
                    v = substr(line, RSTART + 11, RLENGTH - 11) * k
                    line = substr(line, 1, RSTART - 1) sprintf("\"adjClose\":%.8g", v) substr(line, RSTART + RLENGTH)
                }
                if (i == lastRow) sub(/\}$/, "},", line)
                print line
            }
            for (i = 1; i <= n; i++)
                printf "{\"date\":\"%s\",\"close\":%s,\"adjClose\":%.8g}%s\n", D[i], (C[i] + 0) "", A[i], (i < n ? "," : "")
            print "]"
            if (scale) printf "  除權息調整：舊資料 adjClose × %.8f\n", k > "/dev/stderr"
        }
    ' "$TMP/ex_code.txt" "$TMP/new.txt" "$FILE" > "$TMP/out.json"

    jq -e 'length > 0' "$TMP/out.json" > /dev/null
    mv "$TMP/out.json" "$FILE"
    echo "${CODE}：新增 $(wc -l < "$TMP/new.txt" | tr -d ' ') 日（$(head -1 "$TMP/new.txt" | cut -d'|' -f1) ~ $(tail -1 "$TMP/new.txt" | cut -d'|' -f1)）"
done
