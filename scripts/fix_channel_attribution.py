#!/usr/bin/env python3
"""
customer_channel_attribution テーブルの marketing_channel='不明' を
マッピングルールに基づいて一括修正するスクリプト
"""

import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

SUPABASE_URL = "https://plrmqgcigzjuiovsbggf.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscm1xZ2NpZ3pqdWlvdnNiZ2dmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIwMjg1NiwiZXhwIjoyMDg3Nzc4ODU2fQ.6fDV77xPyrcnn9I8YrVRALarp6Szzw4sLfBfby70ZuM"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

AD_CHANNELS = {"FB広告", "Google広告", "X広告"}


def api_get(path, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def api_patch(path, params, body):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    data = json.dumps(body).encode()
    headers = {**HEADERS, "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status


def normalize_value(value):
    """NULL扱いの値をNoneに変換"""
    if value is None:
        return None
    v = str(value).strip()
    if v in ("不明", "その他", ""):
        return None
    return v


def match_rule(rules, source_field, value):
    """
    マッピングルールでマッチを試行。
    source_field が一致し、match_type に応じてマッチしたら channel_name を返す。
    """
    if value is None:
        return None

    value_lower = value.lower()

    # priority順にソート済みのルールを使う
    for rule in rules:
        if rule["source_field"] != source_field:
            continue

        sv = rule["source_value"]
        sv_lower = sv.lower()
        mt = rule["match_type"]

        if mt == "exact" and value_lower == sv_lower:
            return rule["channel_name"]
        elif mt == "contains" and sv_lower in value_lower:
            return rule["channel_name"]
        elif mt == "prefix" and value_lower.startswith(sv_lower):
            return rule["channel_name"]

    return None


def compute_channel(rules, utm_source, utm_medium, utm_campaign,
                    initial_channel, application_reason, sales_route):
    """
    優先順位:
    1. utm_source が広告チャネルにマッチ
    2. utm_source と initial_channel が同じチャネルにマッチ（一致確認）
    3. utm_source マッチ
    4. initial_channel マッチ
    5. application_reason マッチ
    6. sales_route → ルールは無いがraw値フォールバック用
    7. raw値フォールバック（utm_source, initial_channel等の値そのまま）
    8. 不明
    """
    # Normalize
    utm_src = normalize_value(utm_source)
    utm_med = normalize_value(utm_medium)
    utm_cmp = normalize_value(utm_campaign)
    init_ch = normalize_value(initial_channel)
    app_reason = normalize_value(application_reason)
    s_route = normalize_value(sales_route)

    # 1. utm_source → 広告チャネル
    utm_channel = match_rule(rules, "utm_source", utm_src)
    if utm_channel and utm_channel in AD_CHANNELS:
        return utm_channel, "utm_ad", "high"

    # 2. utm_source と initial_channel の両方がマッチし、同じチャネルなら高信頼
    init_channel_match = match_rule(rules, "initial_channel", init_ch)
    if utm_channel and init_channel_match and utm_channel == init_channel_match:
        return utm_channel, "utm_initial_match", "high"

    # 3. utm_source マッチ
    if utm_channel:
        return utm_channel, "utm_source", "medium"

    # 4. initial_channel マッチ
    if init_channel_match:
        return init_channel_match, "initial_channel", "medium"

    # 5. application_reason マッチ
    app_channel = match_rule(rules, "application_reason", app_reason)
    if app_channel:
        return app_channel, "application_reason", "low"

    # 6. sales_route (ルールには無いが、raw値としてフォールバック)
    # sales_routeのマッチルールは存在しないため、スキップ

    # 7. raw値フォールバック - 非NULL値があれば使う
    if utm_src:
        return utm_src, "utm_source_raw", "low"
    if init_ch:
        return init_ch, "initial_channel_raw", "low"
    if app_reason:
        return app_reason, "application_reason_raw", "low"
    if s_route:
        return s_route, "sales_route_raw", "low"

    # 8. 不明
    return "不明", "fallback", "low"


def main():
    print("=" * 60)
    print("帰属チャネル一括修正スクリプト")
    print("=" * 60)

    # 1. マッピングルール取得
    print("\n[1] マッピングルール取得中...")
    rules = api_get("channel_mapping_rules", {"select": "*", "order": "priority.asc"})
    print(f"   ルール数: {len(rules)}")

    # 2. 不明レコード取得
    print("\n[2] marketing_channel='不明' のレコード取得中...")
    unknown_records = api_get("customer_channel_attribution", {
        "select": "*",
        "marketing_channel": "eq.不明",
    })
    print(f"   不明レコード数: {len(unknown_records)}")

    if not unknown_records:
        print("   修正対象なし。終了。")
        return

    # 顧客IDリスト
    customer_ids = [r["customer_id"] for r in unknown_records]

    # 3. customers テーブルから UTM情報取得
    print("\n[3] customers テーブルからUTM情報取得中...")
    customers_data = {}
    # Supabase REST APIではIN句を使う
    batch_size = 50
    for i in range(0, len(customer_ids), batch_size):
        batch = customer_ids[i:i+batch_size]
        ids_str = ",".join(batch)
        data = api_get("customers", {
            "select": "id,utm_source,utm_medium,utm_campaign,application_reason",
            "id": f"in.({ids_str})",
        })
        for c in data:
            customers_data[c["id"]] = c
    print(f"   取得顧客数: {len(customers_data)}")

    # 4. sales_pipeline テーブルから initial_channel, sales_route 取得
    print("\n[4] sales_pipeline テーブルから初期チャネル取得中...")
    pipeline_data = {}
    for i in range(0, len(customer_ids), batch_size):
        batch = customer_ids[i:i+batch_size]
        ids_str = ",".join(batch)
        data = api_get("sales_pipeline", {
            "select": "customer_id,initial_channel,sales_route",
            "customer_id": f"in.({ids_str})",
        })
        for p in data:
            pipeline_data[p["customer_id"]] = p
    print(f"   取得パイプライン数: {len(pipeline_data)}")

    # 5. 帰属チャネル計算 & 更新
    print("\n[5] 帰属チャネル計算・更新中...")
    updated = 0
    still_unknown = 0
    results_summary = {}

    for record in unknown_records:
        cid = record["customer_id"]
        rid = record["id"]

        # raw_data から情報取得（既にattributionレコードに保存されている場合）
        raw = record.get("raw_data") or {}

        # customers テーブルからも取得
        cust = customers_data.get(cid, {})
        pipe = pipeline_data.get(cid, {})

        # 各フィールド（raw_dataとDB両方を確認、DB優先）
        utm_source = cust.get("utm_source") or raw.get("utm_source")
        utm_medium = cust.get("utm_medium") or raw.get("utm_medium")
        utm_campaign = cust.get("utm_campaign") or raw.get("utm_campaign")
        initial_channel = pipe.get("initial_channel") or raw.get("initial_channel")
        application_reason = cust.get("application_reason") or raw.get("application_reason")
        sales_route = pipe.get("sales_route") or raw.get("sales_route")

        # チャネル計算
        channel, source, confidence = compute_channel(
            rules, utm_source, utm_medium, utm_campaign,
            initial_channel, application_reason, sales_route
        )

        if channel == "不明":
            still_unknown += 1
            continue

        # 更新
        now = datetime.now(timezone.utc).isoformat()
        body = {
            "marketing_channel": channel,
            "attribution_source": source,
            "confidence": confidence,
            "computed_at": now,
        }

        try:
            api_patch("customer_channel_attribution", {"id": f"eq.{rid}"}, body)
            updated += 1
            results_summary[channel] = results_summary.get(channel, 0) + 1
            print(f"   [{updated}] {cid[:8]}... → {channel} ({source}, {confidence})")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"   ERROR updating {rid}: {e.code} {err_body}")

    # サマリー
    print("\n" + "=" * 60)
    print("結果サマリー")
    print("=" * 60)
    print(f"  対象レコード数:   {len(unknown_records)}")
    print(f"  更新成功:         {updated}")
    print(f"  依然不明:         {still_unknown}")
    print(f"\n  チャネル別内訳:")
    for ch, cnt in sorted(results_summary.items(), key=lambda x: -x[1]):
        print(f"    {ch}: {cnt}")
    print("=" * 60)


if __name__ == "__main__":
    main()
