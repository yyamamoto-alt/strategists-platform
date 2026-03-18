#!/usr/bin/env python3
"""
LP申込スプレッドシート → CRM一括同期スクリプト

処理:
1. Google Sheets APIで4つのLP申込スプレッドシートの全行を読み取り
2. メールアドレス or 名前 で customers テーブルとマッチング
3. マッチした顧客に対して:
   a. customers.utm_source ← utm_source（既存値がなければ）
   b. customers.utm_medium ← utm_medium（同上）
   c. customers.utm_campaign ← utm_campaign（同上）
   d. customers.utm_id ← utm_id（同上）
   e. customers.target_firm_type ← your-choice1（志望先。既存値が空なら）
   f. application_historyにLP申込レコードが未登録なら追加
4. 結果をサマリー報告
"""

import json
import hashlib
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

# ============================================================
# 設定
# ============================================================
LP_SHEETS = [
    {
        "name": "LP申込(メインLP)",
        "spreadsheet_id": "1K1-GQ3X-ChemxHcAG0oNKIMs459PtokJ2KocuXMBNI0",
        "sheet_name": "sheet",
    },
    {
        "name": "LP申込(LP3)",
        "spreadsheet_id": "1kGPcamRQDjvSJZk3oylkebSV_ptWoBy_yf_Try6p23c",
        "sheet_name": "sheet",
    },
    {
        "name": "LP申込(広告LP)",
        "spreadsheet_id": "1WLmMsOCe4Ymx615mPbPFYkRhk1UGIwJsGU2VXidCBio",
        "sheet_name": "sheet",
    },
    {
        "name": "LP申込(LP4)",
        "spreadsheet_id": "1k3qqqHVeLWbebHg1QGg6nvh-yUArseDtz8RNFuimljE",
        "sheet_name": "sheet",
    },
]

SUPABASE_URL = "https://plrmqgcigzjuiovsbggf.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscm1xZ2NpZ3pqdWlvdnNiZ2dmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIwMjg1NiwiZXhwIjoyMDg3Nzc4ODU2fQ."
    "6fDV77xPyrcnn9I8YrVRALarp6Szzw4sLfBfby70ZuM"
)

# sync_karte_to_crm.py と同じサービスアカウント
from sync_karte_to_crm import SERVICE_ACCOUNT_JSON

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

# テスト用メールアドレス（同期対象外）
TEST_EMAILS = {
    "theroad.and.bluesky@gmail.com",
    "theroad.and.bluesky.2@gmail.com",
    "support@akagiconsulting.com",
    "y.yamamoto@akagiconsulting.com",
}


# ============================================================
# Supabase API helpers
# ============================================================

def api_get(path, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def api_get_all(path, params=None, page_size=1000):
    """ページネーションで全件取得"""
    all_rows = []
    offset = 0
    while True:
        p = dict(params or {})
        p["limit"] = str(page_size)
        p["offset"] = str(offset)
        rows = api_get(path, p)
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def api_patch(path, params, body):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    data = json.dumps(body).encode()
    headers = {**HEADERS, "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status


def api_post(path, body):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode()
    headers = {**HEADERS, "Prefer": "return=representation"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        raise RuntimeError(f"POST {path} failed ({e.code}): {err_body}")


# ============================================================
# Google Sheets 読み取り
# ============================================================

def fetch_all_lp_data():
    """全LP申込スプレッドシートの行を読み取り、LP名付きで返す"""
    creds = Credentials.from_service_account_info(
        SERVICE_ACCOUNT_JSON,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    service = build("sheets", "v4", credentials=creds)

    all_data = []  # list of (lp_name, headers, data_rows)

    for lp in LP_SHEETS:
        print(f"  読み取り中: {lp['name']} ...")
        result = service.spreadsheets().values().get(
            spreadsheetId=lp["spreadsheet_id"],
            range=f"'{lp['sheet_name']}'",
        ).execute()

        rows = result.get("values", [])
        if not rows:
            print(f"    → データなし")
            continue

        headers = rows[0]
        data_rows = rows[1:]
        print(f"    → {len(data_rows)} 行取得")
        all_data.append((lp["name"], headers, data_rows))

    return all_data


# ============================================================
# ユーティリティ
# ============================================================

def normalize_email(email):
    if not email:
        return None
    return email.strip().lower().replace("\u3000", "").replace(" ", "")


def normalize_name(name):
    if not name:
        return None
    return name.strip().replace("\u3000", " ").replace("　", " ")


def compute_hash(row_dict):
    raw = json.dumps(row_dict, ensure_ascii=False, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


def parse_lp_date(date_str):
    """LP申込の日付文字列をISO形式に変換
    例: '2025年3月22日' → '2025-03-22T00:00:00+00:00'
    """
    if not date_str:
        return None
    try:
        # 「2025年3月22日」形式
        import re
        m = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", date_str.strip())
        if m:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=timezone.utc)
            return dt.isoformat()

        # その他の形式
        for fmt in ["%Y/%m/%d", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S"]:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                continue
        return None
    except Exception:
        return None


# ============================================================
# メイン処理
# ============================================================

def main():
    print("=" * 60)
    print("LP申込スプレッドシート → CRM 一括同期")
    print("=" * 60)

    # 1. 全LP申込データ読み取り
    print("\n[1/4] Google Sheetsから全LP申込データを取得中...")
    all_lp_data = fetch_all_lp_data()

    total_rows = sum(len(data_rows) for _, _, data_rows in all_lp_data)
    print(f"\n  合計データ行数: {total_rows}")

    if total_rows == 0:
        print("データがありません。終了します。")
        return

    # 2. Supabaseから顧客データを取得
    print("\n[2/4] Supabaseから顧客データを取得中...")
    customers = api_get_all("customers", {
        "select": "id,name,name_kana,email,utm_source,utm_medium,utm_campaign,utm_id,application_reason"
    })
    print(f"  顧客数: {len(customers)}")

    # customer_emails（副メールアドレス）も取得
    customer_emails = api_get_all("customer_emails", {"select": "customer_id,email"})
    print(f"  副メールアドレス数: {len(customer_emails)}")

    # application_history (既存のLP申込ソースのもの)
    existing_history = api_get_all("application_history", {
        "select": "id,customer_id,source,raw_data_hash",
        "source": "like.LP申込*",
    })
    print(f"  既存LP申込履歴数: {len(existing_history)}")

    # メールアドレス→customer のマップを構築
    email_to_customer = {}
    for c in customers:
        if c.get("email"):
            email_to_customer[normalize_email(c["email"])] = c

    # 副メールからもマッピング
    cid_to_customer = {c["id"]: c for c in customers}
    for ce in customer_emails:
        norm = normalize_email(ce.get("email"))
        if norm and norm not in email_to_customer:
            cust = cid_to_customer.get(ce["customer_id"])
            if cust:
                email_to_customer[norm] = cust

    # 名前→customer のマップ（メールで見つからない場合のフォールバック）
    name_to_customers = {}
    for c in customers:
        name = normalize_name(c.get("name"))
        if name:
            name_to_customers.setdefault(name, []).append(c)

    # existing history hash set
    existing_hashes = set()
    for h in existing_history:
        if h.get("raw_data_hash"):
            existing_hashes.add(h["raw_data_hash"])

    # 3. マッチング＆同期
    print("\n[3/4] マッチング＆同期中...")
    stats = {
        "total_rows": total_rows,
        "skipped_test": 0,
        "matched": 0,
        "unmatched": 0,
        "utm_source_updated": 0,
        "utm_medium_updated": 0,
        "utm_campaign_updated": 0,
        "utm_id_updated": 0,
        "reason_updated": 0,
        "history_added": 0,
        "history_skipped_dup": 0,
        "errors": 0,
    }
    unmatched_list = []
    # 顧客ごとにUTM更新済みかを追跡（最初のLP申込のUTMのみ採用）
    utm_updated_customers = set()

    # カラムマッピング（全シート共通）
    # Headers: ['date', 'time', 'your-name', 'your-email', 'your-tel',
    #           'your-graduate', 'your-choice1', 'utm_source', 'utm_medium',
    #           'utm_id', 'utm_campaign']
    COL = {
        "date": 0,
        "time": 1,
        "your-name": 2,
        "your-email": 3,
        "your-tel": 4,
        "your-graduate": 5,
        "your-choice1": 6,
        "utm_source": 7,
        "utm_medium": 8,
        "utm_id": 9,
        "utm_campaign": 10,
    }

    for lp_name, headers, data_rows in all_lp_data:
        print(f"\n  --- {lp_name} ({len(data_rows)} 行) ---")

        # ヘッダーからカラムインデックスを動的に構築（安全策）
        col_map = {}
        for i, h in enumerate(headers):
            col_map[h.strip()] = i

        def get_col(col_name):
            return col_map.get(col_name, COL.get(col_name))

        for row_idx, row in enumerate(data_rows):
            def get_val(col_name):
                idx = get_col(col_name)
                if idx is None or idx >= len(row):
                    return None
                v = row[idx].strip() if row[idx] else None
                return v if v else None

            row_email = normalize_email(get_val("your-email"))
            row_name = normalize_name(get_val("your-name"))
            row_date = get_val("date")
            row_time = get_val("time")
            row_utm_source = get_val("utm_source")
            row_utm_medium = get_val("utm_medium")
            row_utm_campaign = get_val("utm_campaign")
            row_utm_id = get_val("utm_id")
            row_choice = get_val("your-choice1")

            # テスト行をスキップ
            if row_email and row_email in TEST_EMAILS:
                stats["skipped_test"] += 1
                continue

            # 名前が "test" で始まる行もスキップ
            if row_name and row_name.lower().startswith("test"):
                stats["skipped_test"] += 1
                continue

            # マッチング: メールアドレス優先
            customer = None
            if row_email:
                customer = email_to_customer.get(row_email)

            # メールでマッチしない場合、名前でフォールバック（一意の場合のみ）
            if not customer and row_name:
                candidates = name_to_customers.get(row_name, [])
                if len(candidates) == 1:
                    customer = candidates[0]

            if not customer:
                stats["unmatched"] += 1
                if row_email or row_name:
                    unmatched_list.append({
                        "lp": lp_name,
                        "row": row_idx + 2,
                        "email": row_email,
                        "name": row_name,
                        "date": row_date,
                    })
                continue

            stats["matched"] += 1
            cid = customer["id"]

            try:
                # UTM情報の更新（既存値がない場合のみ）
                utm_updates = {}
                if row_utm_source and not customer.get("utm_source"):
                    utm_updates["utm_source"] = row_utm_source
                if row_utm_medium and not customer.get("utm_medium"):
                    utm_updates["utm_medium"] = row_utm_medium
                if row_utm_campaign and not customer.get("utm_campaign"):
                    utm_updates["utm_campaign"] = row_utm_campaign
                if row_utm_id and not customer.get("utm_id"):
                    utm_updates["utm_id"] = row_utm_id

                # 同じ顧客のUTMを何度も更新しないように
                if utm_updates and cid not in utm_updated_customers:
                    utm_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
                    api_patch("customers", {"id": f"eq.{cid}"}, utm_updates)
                    utm_updated_customers.add(cid)

                    # カウント更新
                    if "utm_source" in utm_updates:
                        stats["utm_source_updated"] += 1
                    if "utm_medium" in utm_updates:
                        stats["utm_medium_updated"] += 1
                    if "utm_campaign" in utm_updates:
                        stats["utm_campaign_updated"] += 1
                    if "utm_id" in utm_updates:
                        stats["utm_id_updated"] += 1

                    # ローカルの顧客データも更新（後続行で再上書きしないように）
                    for k, v in utm_updates.items():
                        if k != "updated_at":
                            customer[k] = v

                # target_firm_type の更新（既存値が空の場合のみ）
                if row_choice:
                    existing_firm_type = customer.get("target_firm_type") or ""
                    if not existing_firm_type:
                        api_patch("customers", {"id": f"eq.{cid}"}, {
                            "target_firm_type": row_choice,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        })
                        customer["target_firm_type"] = row_choice
                        stats["reason_updated"] += 1

                # application_history にレコードを追加（重複チェック）
                raw_data = {}
                for h_idx, h_name in enumerate(headers):
                    if h_idx < len(row) and row[h_idx]:
                        raw_data[h_name] = row[h_idx]
                raw_data["_lp_source"] = lp_name  # どのLPからの申込か記録

                data_hash = compute_hash(raw_data)

                if data_hash in existing_hashes:
                    stats["history_skipped_dup"] += 1
                else:
                    applied_at = parse_lp_date(row_date)
                    history_record = {
                        "customer_id": cid,
                        "source": lp_name,
                        "raw_data": raw_data,
                        "raw_data_hash": data_hash,
                        "notes": f"{lp_name} 行{row_idx + 2}から同期",
                    }
                    if applied_at:
                        history_record["applied_at"] = applied_at

                    api_post("application_history", history_record)
                    existing_hashes.add(data_hash)
                    stats["history_added"] += 1

            except Exception as e:
                stats["errors"] += 1
                print(f"    ERROR 行{row_idx + 2}: {e}")

    # 4. サマリー報告
    print("\n" + "=" * 60)
    print("[4/4] 同期結果サマリー")
    print("=" * 60)
    print(f"  LP全行数:                {stats['total_rows']}")
    print(f"  テスト行スキップ:        {stats['skipped_test']}")
    print(f"  マッチ成功:              {stats['matched']}")
    print(f"  マッチ失敗:              {stats['unmatched']}")
    processed = stats['matched'] + stats['unmatched']
    if processed > 0:
        print(f"  マッチ率:                {stats['matched'] / processed * 100:.1f}%")
    print(f"  ---")
    print(f"  utm_source 更新:         {stats['utm_source_updated']}")
    print(f"  utm_medium 更新:         {stats['utm_medium_updated']}")
    print(f"  utm_campaign 更新:       {stats['utm_campaign_updated']}")
    print(f"  utm_id 更新:             {stats['utm_id_updated']}")
    print(f"  application_reason 更新: {stats['reason_updated']}")
    print(f"  application_history 追加:{stats['history_added']}")
    print(f"  application_history 重複:{stats['history_skipped_dup']}")
    print(f"  エラー:                  {stats['errors']}")

    if unmatched_list:
        print(f"\n  未マッチ一覧（先頭50件）:")
        for item in unmatched_list[:50]:
            print(f"    [{item['lp']}] 行{item['row']}: email={item['email']}, name={item['name']}, date={item['date']}")
        if len(unmatched_list) > 50:
            print(f"    ... 他 {len(unmatched_list) - 50} 件")

    print("\n完了!")


if __name__ == "__main__":
    main()
