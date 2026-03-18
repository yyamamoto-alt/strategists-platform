#!/usr/bin/env python3
"""
カルテスプレッドシート → CRM一括同期スクリプト

処理:
1. Google Sheets APIでカルテの全行を読み取り
2. メールアドレス or 名前+カナ で customers テーブルとマッチング
3. マッチした顧客に対して:
   a. sales_pipeline.initial_channel ← 「弊塾を最初に知った場所」
   b. customers.application_reason_karte ← 「弊塾への面談申し込みのきっかけ、決め手」
   c. application_historyにカルテレコードが未登録なら追加
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
SPREADSHEET_ID = "1uhhZ95mavKrfZHDqVTUY54kNOVIUBUhYLFNdty2kBZM"
SHEET_NAME = "フォームの回答 1"

SUPABASE_URL = "https://plrmqgcigzjuiovsbggf.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscm1xZ2NpZ3pqdWlvdnNiZ2dmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIwMjg1NiwiZXhwIjoyMDg3Nzc4ODU2fQ."
    "6fDV77xPyrcnn9I8YrVRALarp6Szzw4sLfBfby70ZuM"
)

# サービスアカウント認証情報 (.env.localから抽出したもの)
SERVICE_ACCOUNT_JSON = {
    "type": "service_account",
    "project_id": "gen-lang-client-0882302647",
    "private_key_id": "7d89d3c2eed0bd3a91b4bc2ddf930160b9efa53d",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCy1/OzQ+2+a/Ad\nrh4nd9I5dBTLE9z3geViSfseF4DBRZ4Sxki6RNuyuKmUKbNrBXBak+av1R4E+BBP\nQ/fdlBURKe/xkvP+ewPm1cOIWkumJ3Mxp1c/JS3lJ+irz1DXwVywsZSFireon7E9\nRcEhGbsU5q+7FBxFFyj8dtlop7aOL+Nm8vZf4obZ9xPYskTbJpifK7LXILLIx5bw\np5JzV2ShJxhPg9aSpj4Z7o+ENDirouGQK3DO/2rnyBFWWJa1bW1ICee67WzV1ezW\nVtwB99rnW860YzSSILYUZVt3of3z4Tka0gleVZJTh33kVVQXId6rORwa9PY+fIOC\nCkMcH6NrAgMBAAECggEABATS5TgSDoGwO1W10Y8H1zwS2Ytm0qlr5UNvVEcUuoMd\nFCPtIqgFRD6R3pJfUnjXt2YnPKB7FINOIbhC+74y1ctnXAdAdC5nsVcjyTUdcEYa\nEkdF44irP6dTCBIlD9KFcDNu+HjcO3q3MDH++7m8MmVXe2QH/8xCiTkGFd8RVmzK\nCxVhM/7ycv1XJfzSzPHRFYuJya0tDHpnzEahG7mbwwYjtNx46qHVAJjuns6sQ4Bq\nVV2u1wYHazWxnkPSwnumcPcZi0b9rjq8hvBvJkMXEION4Xblvf2Sf/DL8pkZH6uo\nY8PzP5igFo6cT0erKe6fE2V4sB69Wb0RDHGRHuteKQKBgQDcDBu7xN6bxAnrbrSw\n8gXBvWS3MAUjnHJ2n/tL74/232JwP86Br42Yahhm51jCFdzTLeW3c1niUhATgTdm\nZe+Fz4dbCL3G3zMBdTB8Du+WMO6G9OtdKCdNRqIl2OWyQVZIjuWWymn28HEQGUea\nPvlxt6wd/UfhlPp+ZERgw0+qgwKBgQDQEGuCMXB8JAaeDrwHRSI5m1rNexmgGEfM\nLzkmfFqCR9fk61RNp6wwPe/ZAknZvglSi8e7E+mHU5dpLhJJg8uwZgrC72K+jo+q\npjgtUC5eDm8Wy0ZnKAmy8K+IrVjBsu2qMYHsAfWjxMxC4Eg2V3BoSiUUXiCqZ0aJ\nlzVMWd/u+QKBgQDJXZc/hFAGESbWuM9HoaLdAXkaHiqFxRQGNC6d9dMzooaNnAZZ\nLRKRaH1+JbVWnvUel8DA2SFm95vYjYXqAdxoAlqmVuB8DiK58cj1riFXut18yMJd\n1HHqyHl30v2X2yyfZ4z4KbFAlhWRGuEoaPqSMveh1fcimteENDNSrUjJCwKBgDgg\nZc/+JDjowvw6P1C6vovJs8oAbh44zo1vI7yVCRlh5gRz0w8LrzBoVN42dtONJxik\namG18mY2D38pFXfNXNIeBMMnLnz3GhxPsJHQsmFfBWqhtUE4lL03njKBiJLgAKrL\nph+TO79M5EkaFYDLP6Byd+QxrCArseSF7LPG/tiJAoGAMz0eTQZmKbDDt7lUJjtw\nlENoXXckRxB6ZeLbPUEgxWOrKVHmK+EdHNhy8rT43bJeofZkGyVU6lzNiWkOqy40\nGcBeTqftV855iA4lHI92WaJM41yzNiUGY1O1GKfFcGBFfQk0IJxi0qBxp7B3n/vZ\n+HYiWUThGI+qXwjyWPdabpA=\n-----END PRIVATE KEY-----\n",
    "client_email": "strategists-sheets-reader@gen-lang-client-0882302647.iam.gserviceaccount.com",
    "client_id": "111208154417922379730",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/strategists-sheets-reader%40gen-lang-client-0882302647.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com",
}

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
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

def fetch_karte_data():
    """カルテスプレッドシートの全行を読み取り"""
    creds = Credentials.from_service_account_info(
        SERVICE_ACCOUNT_JSON,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    service = build("sheets", "v4", credentials=creds)

    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{SHEET_NAME}'",
    ).execute()

    rows = result.get("values", [])
    if not rows:
        return [], []

    headers = rows[0]
    data_rows = rows[1:]
    return headers, data_rows


# ============================================================
# マッチングロジック
# ============================================================

def normalize_email(email):
    """メールアドレスを正規化"""
    if not email:
        return None
    return email.strip().lower().replace("\u3000", "").replace(" ", "")


def normalize_name(name):
    """名前を正規化（全角スペース→半角スペース、前後空白除去）"""
    if not name:
        return None
    return name.strip().replace("\u3000", " ").replace("　", " ")


def compute_hash(row_dict):
    """行データからハッシュを計算（重複チェック用）"""
    raw = json.dumps(row_dict, ensure_ascii=False, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


# ============================================================
# メイン処理
# ============================================================

def main():
    print("=" * 60)
    print("カルテスプレッドシート → CRM 一括同期")
    print("=" * 60)

    # 1. カルテ読み取り
    print("\n[1/4] Google Sheetsからカルテデータを取得中...")
    headers, data_rows = fetch_karte_data()
    print(f"  ヘッダー数: {len(headers)}")
    print(f"  データ行数: {len(data_rows)}")

    if not data_rows:
        print("データがありません。終了します。")
        return

    # ヘッダーを表示
    print(f"  ヘッダー: {headers}")

    # カラムインデックスを特定
    col_map = {h: i for i, h in enumerate(headers)}

    # 重要カラムを探す
    email_col = None
    name_col = None
    kana_col = None
    channel_col = None       # 「弊塾を最初に知った場所」
    reason_col = None        # 「弊塾への面談申し込みのきっかけ、決め手」(自由記述 col10)
    reason_multi_col = None  # 「弊塾への面談申し込みの決め手 (複数選択可)」(col40)
    timestamp_col = None

    for h, i in col_map.items():
        h_lower = h.strip()
        if "メールアドレス" in h_lower:
            email_col = i
        if h_lower == "お名前" or h_lower == "氏名" or h_lower == "名前":
            name_col = i
        if "フリガナ" in h_lower or "ふりがな" in h_lower or "カナ" in h_lower:
            kana_col = i
        if "最初に知った" in h_lower or "知った場所" in h_lower:
            channel_col = i
        if "きっかけ" in h_lower and "決め手" in h_lower:
            # col10: 「弊塾への面談申し込みのきっかけ、決め手」(自由記述)
            reason_col = i
        elif "決め手" in h_lower and "複数選択" in h_lower:
            # col40: 「弊塾への面談申し込みの決め手 (複数選択可)」
            reason_multi_col = i
        if "タイムスタンプ" in h_lower:
            timestamp_col = i

    print(f"\n  カラム特定結果:")
    print(f"    メール: col {email_col} ({headers[email_col] if email_col is not None else '未検出'})")
    print(f"    名前: col {name_col} ({headers[name_col] if name_col is not None else '未検出'})")
    print(f"    カナ: col {kana_col} ({headers[kana_col] if kana_col is not None else '未検出'})")
    print(f"    知った場所: col {channel_col} ({headers[channel_col] if channel_col is not None else '未検出'})")
    print(f"    きっかけ(自由記述): col {reason_col} ({headers[reason_col] if reason_col is not None else '未検出'})")
    print(f"    決め手(複数選択): col {reason_multi_col} ({headers[reason_multi_col] if reason_multi_col is not None else '未検出'})")
    print(f"    タイムスタンプ: col {timestamp_col} ({headers[timestamp_col] if timestamp_col is not None else '未検出'})")

    if email_col is None and name_col is None:
        print("ERROR: メールアドレスも名前カラムも見つかりません。終了します。")
        return

    # 2. Supabaseから顧客データを取得
    print("\n[2/4] Supabaseから顧客データを取得中...")
    customers = api_get_all("customers", {"select": "id,name,name_kana,email,application_reason_karte,initial_channel"})
    print(f"  顧客数: {len(customers)}")

    # customer_emails（副メールアドレス）も取得
    customer_emails = api_get_all("customer_emails", {"select": "customer_id,email"})
    print(f"  副メールアドレス数: {len(customer_emails)}")

    # sales_pipeline
    pipelines = api_get_all("sales_pipeline", {"select": "id,customer_id,initial_channel"})
    print(f"  パイプライン数: {len(pipelines)}")

    # application_history (既存のカルテソースのもの)
    existing_history = api_get_all("application_history", {
        "select": "id,customer_id,source,raw_data_hash",
        "source": "eq.カルテ",
    })
    print(f"  既存カルテ履歴数: {len(existing_history)}")

    # メールアドレス→customer_id のマップを構築
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

    # 名前+カナ→customer のマップ（メールで見つからない場合のフォールバック）
    namekana_to_customer = {}
    for c in customers:
        name = normalize_name(c.get("name"))
        kana = normalize_name(c.get("name_kana"))
        if name and kana:
            key = f"{name}|{kana}"
            namekana_to_customer[key] = c

    # pipeline: customer_id → pipeline
    cid_to_pipeline = {}
    for p in pipelines:
        if p.get("customer_id"):
            cid_to_pipeline[p["customer_id"]] = p

    # existing history hash set
    existing_hashes = set()
    existing_cid_source = set()
    for h in existing_history:
        if h.get("raw_data_hash"):
            existing_hashes.add(h["raw_data_hash"])
        existing_cid_source.add(f"{h['customer_id']}|カルテ")

    # 3. マッチング＆同期
    print("\n[3/4] マッチング＆同期中...")
    stats = {
        "total_rows": len(data_rows),
        "matched": 0,
        "unmatched": 0,
        "channel_updated": 0,
        "reason_updated": 0,
        "pipeline_updated": 0,
        "history_added": 0,
        "history_skipped_dup": 0,
        "errors": 0,
    }
    unmatched_list = []

    for row_idx, row in enumerate(data_rows):
        # 安全にカラム値取得
        def get_val(col_idx):
            if col_idx is None:
                return None
            if col_idx < len(row):
                v = row[col_idx].strip() if row[col_idx] else None
                return v if v else None
            return None

        row_email = normalize_email(get_val(email_col))
        row_name = normalize_name(get_val(name_col))
        row_kana = normalize_name(get_val(kana_col))
        row_channel = get_val(channel_col)
        # きっかけ: 自由記述(col10)を優先、なければ複数選択(col40)をフォールバック
        row_reason_free = get_val(reason_col)
        row_reason_multi = get_val(reason_multi_col)
        row_reason = row_reason_free or row_reason_multi
        # 両方あれば結合
        if row_reason_free and row_reason_multi:
            row_reason = f"{row_reason_free}【決め手: {row_reason_multi}】"
        row_timestamp = get_val(timestamp_col)

        # マッチング
        customer = None
        if row_email:
            customer = email_to_customer.get(row_email)

        if not customer and row_name and row_kana:
            key = f"{row_name}|{row_kana}"
            customer = namekana_to_customer.get(key)

        if not customer:
            stats["unmatched"] += 1
            if row_email or row_name:
                unmatched_list.append({
                    "row": row_idx + 2,
                    "email": row_email,
                    "name": row_name,
                })
            continue

        stats["matched"] += 1
        cid = customer["id"]

        try:
            # a. customers.application_reason_karte を更新
            if row_reason:
                api_patch("customers", {"id": f"eq.{cid}"}, {
                    "application_reason_karte": row_reason,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                stats["reason_updated"] += 1

            # b. customers.initial_channel を更新（カルテの「知った場所」）
            if row_channel:
                api_patch("customers", {"id": f"eq.{cid}"}, {
                    "initial_channel": row_channel,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                stats["channel_updated"] += 1

            # c. sales_pipeline.initial_channel も更新
            pipeline = cid_to_pipeline.get(cid)
            if pipeline and row_channel:
                api_patch("sales_pipeline", {"id": f"eq.{pipeline['id']}"}, {
                    "initial_channel": row_channel,
                })
                stats["pipeline_updated"] += 1

            # d. application_history にカルテレコードを追加（重複チェック）
            # raw_dataとして行全体を保存
            raw_data = {}
            for h_idx, h_name in enumerate(headers):
                if h_idx < len(row) and row[h_idx]:
                    raw_data[h_name] = row[h_idx]

            data_hash = compute_hash(raw_data)

            if data_hash in existing_hashes:
                stats["history_skipped_dup"] += 1
            else:
                history_record = {
                    "customer_id": cid,
                    "source": "カルテ",
                    "raw_data": raw_data,
                    "raw_data_hash": data_hash,
                    "notes": f"カルテ行{row_idx + 2}から同期",
                }
                if row_timestamp:
                    history_record["applied_at"] = parse_timestamp(row_timestamp)

                api_post("application_history", history_record)
                existing_hashes.add(data_hash)
                stats["history_added"] += 1

        except Exception as e:
            stats["errors"] += 1
            print(f"  ERROR 行{row_idx + 2}: {e}")

    # 4. サマリー報告
    print("\n" + "=" * 60)
    print("[4/4] 同期結果サマリー")
    print("=" * 60)
    print(f"  カルテ全行数:            {stats['total_rows']}")
    print(f"  マッチ成功:              {stats['matched']}")
    print(f"  マッチ失敗:              {stats['unmatched']}")
    print(f"  マッチ率:                {stats['matched'] / stats['total_rows'] * 100:.1f}%")
    print(f"  ---")
    print(f"  initial_channel 更新:    {stats['channel_updated']} (customers)")
    print(f"  pipeline 更新:           {stats['pipeline_updated']} (sales_pipeline)")
    print(f"  application_reason 更新: {stats['reason_updated']} (customers)")
    print(f"  application_history 追加:{stats['history_added']}")
    print(f"  application_history 重複:{stats['history_skipped_dup']}")
    print(f"  エラー:                  {stats['errors']}")

    if unmatched_list:
        print(f"\n  未マッチ一覧（先頭30件）:")
        for item in unmatched_list[:30]:
            print(f"    行{item['row']}: email={item['email']}, name={item['name']}")
        if len(unmatched_list) > 30:
            print(f"    ... 他 {len(unmatched_list) - 30} 件")

    print("\n完了!")


def parse_timestamp(ts_str):
    """タイムスタンプ文字列をISO形式に変換"""
    if not ts_str:
        return None
    try:
        # "2024/03/15 10:30:45" or "2024/3/15 10:30:45"
        for fmt in ["%Y/%m/%d %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
            try:
                dt = datetime.strptime(ts_str.strip(), fmt)
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                continue
        return None
    except Exception:
        return None


if __name__ == "__main__":
    main()
