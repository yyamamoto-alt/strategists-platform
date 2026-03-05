#!/usr/bin/env python3
"""
カリキュラムDBの各エントリのページ内容を取得してLMSレッスンに流し込む
各エントリはNotionページとして内容を持っているので、ブロックをHTMLに変換する
"""

import json
import os
import requests
import time
import re
import sys

# notion-to-lms-migration.py から変換関数をインポート
sys.path.insert(0, "scripts")
from importlib import util as import_util
spec = import_util.spec_from_file_location("migration", "scripts/notion-to-lms-migration.py")
migration = import_util.module_from_spec(spec)
spec.loader.exec_module(migration)

fetch_blocks_recursive = migration.fetch_blocks_recursive
blocks_to_html = migration.blocks_to_html

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_VERSION = "2022-06-28"
SUPABASE_URL = "https://api.supabase.com/v1/projects/plrmqgcigzjuiovsbggf/database/query"
SUPABASE_TOKEN = os.environ.get("SUPABASE_TOKEN", "")

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
}


def supabase_query(sql):
    resp = requests.post(
        SUPABASE_URL,
        headers={"Authorization": f"Bearer {SUPABASE_TOKEN}", "Content-Type": "application/json"},
        json={"query": sql},
    )
    if resp.status_code not in (200, 201):
        print(f"  SQL Error: {resp.status_code} {resp.text[:300]}")
        return None
    try:
        return resp.json()
    except:
        return []


def update_lesson(lesson_id, html_content):
    escaped = html_content.replace("'", "''")
    sql = f"UPDATE lessons SET markdown_content = '{escaped}', content_format = 'html', updated_at = now() WHERE id = '{lesson_id}'"
    return supabase_query(sql) is not None


def fetch_curriculum_db(db_id):
    """カリキュラムDBの全エントリを取得"""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    results = []
    has_more = True
    cursor = None
    while has_more:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        resp = requests.post(url, headers=NOTION_HEADERS, json=body)
        if resp.status_code != 200:
            print(f"  Error: {resp.status_code}")
            break
        data = resp.json()
        results.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        cursor = data.get("next_cursor")
        time.sleep(0.35)
    return results


def get_entry_title(entry):
    props = entry.get("properties", {})
    title_rt = props.get("名前", {}).get("title", [])
    return "".join(t.get("plain_text", "") for t in title_rt).strip()


def normalize_title(title):
    """番号を除去してタイトルを正規化"""
    return re.sub(r'^\d+\.\s*', '', title).strip()


def main():
    print("=" * 60)
    print("📖 カリキュラムDBページ内容 → LMSレッスン移行")
    print("=" * 60)

    # カリキュラムDB → コースslug マッピング
    dbs = {
        "2bc42aed-d74b-80c8-9783-d5796aefab46": "shinsotsu-standard-light",
        "2cb42aed-d74b-812d-8984-cdf56a2189be": "shinsotsu-minimum",
        "2c442aed-d74b-818d-a70a-ecb5e9b5cc48": "shinsotsu-senkomu",
    }

    for db_id, course_slug in dbs.items():
        print(f"\n🎓 Processing: {course_slug}")
        print("-" * 50)

        # DB エントリ取得
        entries = fetch_curriculum_db(db_id)
        print(f"  {len(entries)} entries in DB")

        # LMSレッスン取得
        sql = f"""
        SELECT l.id, l.title, l.sort_order, m.sort_order as module_sort
        FROM lessons l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = l.course_id
        WHERE c.slug = '{course_slug}'
        ORDER BY m.sort_order, l.sort_order
        """
        lessons = supabase_query(sql) or []
        print(f"  {len(lessons)} lessons in LMS")

        # エントリとレッスンをタイトルでマッチング
        updated = 0
        for entry in entries:
            entry_title = get_entry_title(entry)
            entry_name = normalize_title(entry_title)
            entry_num_match = re.match(r'^(\d+)', entry_title)
            entry_num = int(entry_num_match.group(1)) if entry_num_match else 0
            page_id = entry["id"]

            # LMSレッスンでマッチするものを探す
            matched_lesson = None
            for lesson in lessons:
                lesson_name = normalize_title(lesson["title"])
                lesson_num_match = re.match(r'^(\d+)', lesson["title"])
                lesson_num = int(lesson_num_match.group(1)) if lesson_num_match else 0

                # 番号が同じならマッチ
                if entry_num > 0 and lesson_num > 0 and entry_num == lesson_num:
                    matched_lesson = lesson
                    break
                # タイトルが一致
                if entry_name and lesson_name and (entry_name in lesson_name or lesson_name in entry_name):
                    matched_lesson = lesson
                    break

            if not matched_lesson:
                print(f"  ⚠️  No LMS lesson for: {entry_title}")
                continue

            # ページのブロック内容を取得
            print(f"  📖 {entry_title}...", end="", flush=True)
            blocks = fetch_blocks_recursive(page_id)
            time.sleep(0.35)

            if not blocks:
                print(" (empty page)")
                continue

            html = blocks_to_html(blocks)
            if not html or len(html.strip()) < 10:
                print(" (no content)")
                continue

            # LMSレッスンを更新
            success = update_lesson(matched_lesson["id"], html)
            if success:
                print(f" ✅ ({len(html)} chars)")
                updated += 1
            else:
                print(f" ❌ update failed")

        print(f"\n  📊 {updated}/{len(entries)} updated for {course_slug}")

    # ============================
    # ファーム別選考情報DB
    # ============================
    print(f"\n🏢 ファーム別選考情報の取得")
    print("-" * 50)
    firm_db_id = "2bc42aed-d74b-8001-9074-e1f1467af3f7"
    firm_entries = fetch_curriculum_db(firm_db_id)
    print(f"  {len(firm_entries)} firms in DB")

    # ファーム名 → LMSレッスンタイトルマッピング
    firm_to_lesson = {
        "McKinsey": "McKinsey & Company",
        "BCG": "Boston Consulting Group",
        "Bain": "Bain & Company",
        "A.T. Kearney": "A.T. Kearney",
        "Kearney": "A.T. Kearney",
        "PwC": "PwC Strategy&",
        "Strategy&": "PwC Strategy&",
        "ADL": "Arthur D. Little",
        "Arthur D. Little": "Arthur D. Little",
        "Roland Berger": "Roland Berger",
        "RB": "Roland Berger",
    }

    for entry in firm_entries:
        firm_title = get_entry_title(entry)
        page_id = entry["id"]

        print(f"  📖 {firm_title}...", end="", flush=True)
        blocks = fetch_blocks_recursive(page_id)
        time.sleep(0.35)

        if not blocks:
            print(" (empty)")
            continue

        html = blocks_to_html(blocks)
        if not html or len(html.strip()) < 10:
            print(" (no content)")
            continue

        # このファームに対応するレッスンを全プランで探して更新
        matched_count = 0
        for firm_key, lesson_name in firm_to_lesson.items():
            if firm_key.lower() in firm_title.lower():
                # 全プランのレッスンを検索
                for course_slug in dbs.values():
                    sql = f"""
                    SELECT l.id FROM lessons l
                    JOIN courses c ON c.id = l.course_id
                    WHERE c.slug = '{course_slug}' AND l.title LIKE '%{lesson_name}%'
                    LIMIT 1
                    """
                    result = supabase_query(sql)
                    if result and len(result) > 0:
                        update_lesson(result[0]["id"], html)
                        matched_count += 1
                break

        if matched_count > 0:
            print(f" ✅ ({len(html)} chars, {matched_count} lessons)")
        else:
            print(f" (no matching lessons)")

    print("\n" + "=" * 60)
    print("✅ カリキュラムページ移行完了")
    print("=" * 60)


if __name__ == "__main__":
    main()
