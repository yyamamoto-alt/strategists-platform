#!/usr/bin/env python3
"""
指導報告DATABASE.xlsx → Supabase coaching_reports テーブル インポートスクリプト

使い方:
  1. pip install openpyxl supabase
  2. 環境変数を設定:
     export SUPABASE_URL="https://plrmqgcigzjuiovsbggf.supabase.co"
     export SUPABASE_SERVICE_KEY="eyJhbG..."
  3. python scripts/import-coaching-reports.py --dry-run  (確認)
  4. python scripts/import-coaching-reports.py             (本番投入)

オプション:
  --dry-run     SQLファイル出力のみ（DBには投入しない）
  --limit N     最初のN行だけ処理（テスト用）
  --clear       インポート前に既存データを削除
"""

import argparse
import os
import sys
import uuid
from datetime import datetime, date

import openpyxl

EXCEL_PATH = os.path.expanduser("~/Downloads/指導報告DATABASE.xlsx")
SHEET_NAME = "シート1"

# ============================================================
# ユーティリティ（migrate-from-excel.py と同じパターン）
# ============================================================

def clean_value(val):
    """None, 空文字, '#N/A' 等を処理"""
    if val is None:
        return None
    s = str(val).strip()
    if s in ('', '#N/A', '#REF!', '#VALUE!', '#DIV/0!', '#NAME?', 'None', '-'):
        return None
    return s


def to_date(val):
    """日付型への変換"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    if isinstance(val, date):
        return val.strftime('%Y-%m-%d')
    s = clean_value(val)
    if s is None:
        return None
    try:
        return datetime.fromisoformat(s.replace(' ', 'T')).strftime('%Y-%m-%d')
    except Exception:
        pass
    return s


def to_int(val):
    """整数への変換"""
    s = clean_value(val)
    if s is None:
        return None
    try:
        f = float(s)
        return int(f)
    except Exception:
        return None


def to_text(val):
    """テキストへの変換"""
    s = clean_value(val)
    if s is None:
        return None
    if isinstance(val, (int, float)):
        if s.endswith('.0'):
            s = s[:-2]
    return s


def escape_sql(val):
    """SQL文字列エスケープ"""
    if val is None:
        return 'NULL'
    if isinstance(val, bool):
        return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''")
    s = s.replace('\r\n', '\\n').replace('\r', '\\n').replace('\n', '\\n')
    s = s.replace('\t', '\\t')
    return f"E'{s}'"


# ============================================================
# メイン処理
# ============================================================

def process_coaching_reports(wb, customer_email_map, limit=None):
    """シート1を処理して coaching_reports 用データリストを返す"""
    ws = wb[SHEET_NAME]
    results = []
    skipped = 0

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:  # ヘッダー行スキップ
            continue
        if limit and i > limit:
            break

        row = list(row)

        # 指導日が空ならスキップ
        coaching_date = to_date(row[0] if len(row) > 0 else None)
        if not coaching_date:
            skipped += 1
            continue

        email = to_text(row[1] if len(row) > 1 else None)
        customer_id = None
        if email and customer_email_map:
            customer_id = customer_email_map.get(email.lower())

        data = {
            'id': str(uuid.uuid4()),
            'coaching_date': coaching_date,
            'email': email,
            'session_number': to_int(row[2] if len(row) > 2 else None),
            'mentor_name': to_text(row[3] if len(row) > 3 else None),
            'cancellation': to_text(row[4] if len(row) > 4 else None),
            'level_fermi': to_text(row[5] if len(row) > 5 else None),
            'level_case': to_text(row[6] if len(row) > 6 else None),
            'level_mck': to_text(row[7] if len(row) > 7 else None),
            'customer_id': customer_id,
        }
        results.append(data)

    print(f"  指導報告: {len(results)} records, {skipped} skipped (日付なし)")
    return results


def fetch_customer_email_map(supabase_url, supabase_key):
    """Supabaseからcustomers.email → id のマッピングを取得"""
    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)

        # 全顧客を取得（emailとidのみ）
        result = client.table('customers').select('id, email').execute()
        email_map = {}
        for row in result.data:
            if row.get('email'):
                email_map[row['email'].lower()] = row['id']
        print(f"  顧客マスタ: {len(email_map)} emails loaded")
        return email_map
    except Exception as e:
        print(f"  警告: 顧客マスタ取得失敗 ({e}), customer_id は設定されません")
        return {}


def dict_to_insert_sql(table, data):
    """dictからINSERT文を生成"""
    cols = []
    vals = []
    for k, v in data.items():
        if v is not None:
            cols.append(k)
            vals.append(escape_sql(v))
    return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(vals)});"


def generate_sql(records, output_dir):
    """SQL出力"""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, 'coaching_reports.sql')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(f"-- coaching_reports ({len(records)} records)\n")
        f.write(f"-- 生成日時: {datetime.now().isoformat()}\n\n")
        f.write("BEGIN;\n\n")
        for data in records:
            f.write(dict_to_insert_sql('coaching_reports', data) + '\n')
        f.write("\nCOMMIT;\n")

    print(f"\n  SQL出力: {filepath} ({len(records)} records)")
    return filepath


def import_to_supabase(records, supabase_url, supabase_key, clear=False):
    """Supabaseに直接投入"""
    from supabase import create_client
    client = create_client(supabase_url, supabase_key)

    if clear:
        print("  既存データ削除中...")
        client.table('coaching_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print("  削除完了")

    # 500件ずつバッチ投入
    batch_size = 500
    total = len(records)
    inserted = 0

    for i in range(0, total, batch_size):
        batch = records[i:i + batch_size]
        # None値のキーを除去
        clean_batch = []
        for record in batch:
            clean_record = {k: v for k, v in record.items() if v is not None}
            clean_batch.append(clean_record)

        try:
            client.table('coaching_reports').insert(clean_batch).execute()
            inserted += len(clean_batch)
            print(f"  投入: {inserted}/{total} ({inserted * 100 // total}%)")
        except Exception as e:
            print(f"  エラー (行 {i+1}-{i+len(batch)}): {e}")
            # 個別に投入を試みる
            for j, record in enumerate(clean_batch):
                try:
                    client.table('coaching_reports').insert(record).execute()
                    inserted += 1
                except Exception as e2:
                    print(f"    スキップ (行 {i+j+1}): {e2}")

    print(f"\n  完了: {inserted}/{total} records inserted")


def main():
    parser = argparse.ArgumentParser(description='指導報告DATABASE → Supabase インポート')
    parser.add_argument('--excel', default=EXCEL_PATH, help='Excelファイルパス')
    parser.add_argument('--dry-run', action='store_true', help='SQLファイル出力のみ')
    parser.add_argument('--limit', type=int, help='処理行数制限（テスト用）')
    parser.add_argument('--clear', action='store_true', help='インポート前に既存データ削除')
    args = parser.parse_args()

    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')

    print(f"Excelファイル: {args.excel}")
    print(f"モード: {'dry-run (SQL出力のみ)' if args.dry_run else '本番投入'}")
    if args.limit:
        print(f"制限: 最初の{args.limit}行のみ")
    print()

    # 顧客メールマップ取得
    customer_email_map = {}
    if supabase_url and supabase_key:
        print("顧客マスタ読み込み中...")
        customer_email_map = fetch_customer_email_map(supabase_url, supabase_key)
    else:
        print("警告: SUPABASE_URL/SUPABASE_SERVICE_KEY未設定 → customer_id は設定されません")

    # Excel読み込み
    print(f"\nExcelファイル読み込み中...")
    wb = openpyxl.load_workbook(args.excel, read_only=True, data_only=True)

    print(f"\n指導報告処理中...")
    records = process_coaching_reports(wb, customer_email_map, limit=args.limit)
    wb.close()

    if args.dry_run:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'migration_sql')
        generate_sql(records, output_dir)
    else:
        if not supabase_url or not supabase_key:
            print("\nエラー: SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください")
            sys.exit(1)
        import_to_supabase(records, supabase_url, supabase_key, clear=args.clear)

    print(f"\n合計 {len(records)} レコード処理完了")


if __name__ == '__main__':
    main()
