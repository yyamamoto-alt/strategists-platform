#!/usr/bin/env python3
"""
単独コースのコンテンツをカリキュラムレッスンにコピーする
新卒3プラン（スタンダード/ライト、ミニマム、選コミュ）のレッスンは
同じ教材の参照なので、単独コースから内容をコピー

また、カリキュラムDB（Notion）のテキストフィールドから
メンタリング系レッスンの説明文を取得
"""

import json
import os
import requests
import time
import re

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
        headers={
            "Authorization": f"Bearer {SUPABASE_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
    )
    if resp.status_code not in (200, 201):
        print(f"  SQL Error: {resp.status_code} {resp.text[:300]}")
        return None
    try:
        return resp.json()
    except:
        return []


def notion_post(url, body=None):
    resp = requests.post(url, headers=NOTION_HEADERS, json=body or {})
    if resp.status_code == 429:
        time.sleep(2)
        resp = requests.post(url, headers=NOTION_HEADERS, json=body or {})
    if resp.status_code != 200:
        print(f"  Notion API Error: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json()


def rich_text_to_html(rich_texts):
    """Notion rich_text をHTMLに変換"""
    parts = []
    for rt in rich_texts:
        text = rt.get("plain_text", "")
        if not text:
            continue
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        ann = rt.get("annotations", {})
        href = rt.get("href")
        if ann.get("bold"):
            text = f"<strong>{text}</strong>"
        if ann.get("italic"):
            text = f"<em>{text}</em>"
        if ann.get("underline"):
            text = f"<u>{text}</u>"
        if ann.get("code"):
            text = f"<code>{text}</code>"
        if href:
            text = f'<a href="{href}" target="_blank" rel="noopener">{text}</a>'
        parts.append(text)
    return "".join(parts)


# ============================
# カリキュラムレッスン → 単独コースマッピング
# ============================
# タイトルキーワード → 単独コース slug
CONTENT_MAP = {
    "戦コン就活ロードマップ": None,  # 新卒専用、カリキュラムDBから取得
    "基礎思考力読本": None,  # 同上
    "フェルミ推定の教科書": "フェルミ推定の教科書-完全版",
    "ケース面接の教科書": "ケース面接の教科書-2025最新版",
    "フェルミ推定対策動画講座": "フェルミ推定対策動画講座",
    "ケース面接対策動画講座": "ケース面接対策動画講座",
    "マッキンゼー内定の教科書": "総コン内定の教科書",
    "論点設計": "マッキンゼー-論点設計の教科書",
    "McKinsey": None,  # ファーム別、個別にNotionから取得
    "Boston Consulting": None,
    "Bain": None,
    "Kearney": None,
    "Strategy&": None,
    "Arthur D. Little": None,
    "Roland Berger": None,
    "Webテスト徹底攻略": "webテスト対策-新卒",
    "GDの教科書": None,  # GD教科書用ページを探す
    "GD対策会": None,  # イベント
    "Jobの教科書": "ジョブの教科書-完全版-新卒向け",
    "ジョブ対策会": None,  # イベント
    "ビヘイビア": "ビヘイビア面接準備にあたってのチェックポイント",
    "模擬面接テスト": None,  # テスト
    "戦コン就活で役立つ辞書": None,
    "課題別": "課題別筋の良い打ち手の方向性",
    "筋の良い打ち手": "課題別筋の良い打ち手の方向性",
    "推薦図書": "推奨図書リスト",
    "仮説創出": "筋の良い仮説創出のための分析観点",
    "分析観点": "筋の良い仮説創出のための分析観点",
    "キードライバー": "業界・商材別キードライバー一覧",
}

# メンタリング系レッスンのキーワード（コンテンツは説明文のみ）
MENTORING_LESSONS = [
    "フェルミ推定Ⅰ", "売上向上Ⅰ", "売上向上Ⅱ", "売上向上Ⅲ",
    "公共系Ⅰ", "綱羅構造", "フェルミ推定Ⅱ", "公共系Ⅱ",
    "利益向上", "特殊系",
]


def find_matching_slug(lesson_title):
    """レッスンタイトルからマッチする単独コースのslugを見つける"""
    # 番号を除去
    clean = re.sub(r'^\d+\.\s*', '', lesson_title).strip()

    for keyword, slug in CONTENT_MAP.items():
        if keyword in clean:
            return slug
    return None


def is_mentoring_lesson(lesson_title):
    """メンタリング系レッスンかどうか判定"""
    clean = re.sub(r'^\d+\.\s*', '', lesson_title).strip()
    for keyword in MENTORING_LESSONS:
        if keyword in clean:
            return True
    return False


def get_standalone_content(slug):
    """単独コースのレッスンコンテンツを取得"""
    sql = f"""
    SELECT l.markdown_content, l.content_format FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE c.slug = '{slug}'
    ORDER BY l.sort_order LIMIT 1
    """
    result = supabase_query(sql)
    if result and len(result) > 0 and result[0].get("markdown_content"):
        return result[0]["markdown_content"], result[0].get("content_format", "markdown")
    return None, None


def fetch_curriculum_db_entries(db_id):
    """カリキュラムDBからエントリを取得"""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    all_results = []
    has_more = True
    start_cursor = None

    while has_more:
        body = {"page_size": 100}
        if start_cursor:
            body["start_cursor"] = start_cursor

        data = notion_post(url, body)
        if not data:
            break

        all_results.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
        time.sleep(0.35)

    return all_results


def process_curriculum_entry(entry):
    """カリキュラムDBエントリからタイトルとテキストを抽出"""
    props = entry.get("properties", {})

    # タイトル
    title_prop = props.get("名前", {})
    title = ""
    if title_prop.get("title"):
        title = "".join(t.get("plain_text", "") for t in title_prop["title"])

    # チャプター
    chapter = ""
    chapter_prop = props.get("チャプター", {})
    if chapter_prop.get("select"):
        chapter = chapter_prop["select"].get("name", "")

    # 教材種類
    material_type = ""
    type_prop = props.get("教材種類", {})
    if type_prop.get("select"):
        material_type = type_prop["select"].get("name", "")

    # テキスト（説明文）
    text_html = ""
    text_prop = props.get("テキスト", {})
    if text_prop.get("rich_text"):
        text_html = rich_text_to_html(text_prop["rich_text"])

    return {
        "title": title,
        "chapter": chapter,
        "type": material_type,
        "text_html": text_html,
        "page_id": entry["id"],
    }


def main():
    print("=" * 60)
    print("📋 カリキュラムレッスンへのコンテンツコピー")
    print("=" * 60)

    # 1. カリキュラムDBからエントリを取得
    print("\n📚 カリキュラムDB取得中...")
    curriculum_dbs = {
        "2bc42aed-d74b-80c8-9783-d5796aefab46": "スタンダード/ライト",
        "2cb42aed-d74b-812d-8984-cdf56a2189be": "ミニマム",
        "2c442aed-d74b-818d-a70a-ecb5e9b5cc48": "選コミュ",
    }

    curriculum_entries = {}
    for db_id, db_name in curriculum_dbs.items():
        print(f"  Fetching {db_name}...")
        entries = fetch_curriculum_db_entries(db_id)
        parsed = [process_curriculum_entry(e) for e in entries]
        curriculum_entries[db_name] = parsed
        print(f"  → {len(parsed)} entries")
        time.sleep(0.5)

    # 2. 各プランのレッスンを処理
    plans = {
        "shinsotsu-standard-light": "スタンダード/ライト",
        "shinsotsu-minimum": "ミニマム",
        "shinsotsu-senkomu": "選コミュ",
    }

    for course_slug, plan_name in plans.items():
        print(f"\n🎓 Processing: {plan_name} ({course_slug})")
        print("-" * 40)

        sql = f"""
        SELECT l.id, l.title, l.sort_order, l.lesson_type, l.video_url,
               l.markdown_content IS NOT NULL AND length(l.markdown_content) > 10 as has_real_content,
               l.content_format,
               m.title as module_title
        FROM lessons l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = l.course_id
        WHERE c.slug = '{course_slug}'
        ORDER BY m.sort_order, l.sort_order
        """
        lessons = supabase_query(sql) or []
        entries = curriculum_entries.get(plan_name, [])

        updated = 0
        for lesson in lessons:
            title = lesson["title"].strip()
            lesson_id = lesson["id"]
            has_content = lesson.get("has_real_content", False)

            # 番号を抽出
            num_match = re.match(r'^(\d+)\.\s*(.+)$', title)
            lesson_name = num_match.group(2).strip() if num_match else title
            lesson_num = int(num_match.group(1)) if num_match else 0

            # A) 単独コースからコンテンツをコピー
            slug = find_matching_slug(title)
            if slug:
                content, fmt = get_standalone_content(slug)
                if content and len(content) > 20:
                    escaped = content.replace("'", "''")
                    update_sql = f"""
                    UPDATE lessons SET
                        markdown_content = '{escaped}',
                        content_format = '{fmt or "html"}',
                        updated_at = now()
                    WHERE id = '{lesson_id}'
                    """
                    supabase_query(update_sql)
                    print(f"  ✅ {title} ← {slug} ({len(content)} chars)")
                    updated += 1
                    continue

            # B) メンタリング系: カリキュラムDBのテキストフィールドから説明を取得
            if is_mentoring_lesson(title):
                # カリキュラムDBでマッチするエントリを探す
                matching_entry = None
                for entry in entries:
                    entry_name = re.sub(r'^\d+\.\s*', '', entry["title"]).strip()
                    if entry_name and (entry_name in lesson_name or lesson_name in entry_name):
                        matching_entry = entry
                        break

                if matching_entry and matching_entry["text_html"]:
                    # 説明テキストからHTMLを生成
                    desc_html = f"<h2>{lesson_name}</h2>"
                    desc_html += f"<p><strong>チャプター:</strong> {matching_entry['chapter']}</p>"
                    desc_html += f"<p><strong>教材種類:</strong> {matching_entry['type']}</p>"
                    if matching_entry["text_html"]:
                        desc_html += f"<blockquote>{matching_entry['text_html']}</blockquote>"

                    escaped = desc_html.replace("'", "''")
                    update_sql = f"""
                    UPDATE lessons SET
                        markdown_content = '{escaped}',
                        content_format = 'html',
                        updated_at = now()
                    WHERE id = '{lesson_id}'
                    """
                    supabase_query(update_sql)
                    print(f"  ✅ {title} ← DB text ({len(desc_html)} chars)")
                    updated += 1
                    continue
                else:
                    # カリキュラムDBにテキストがない場合は基本的な説明を設定
                    desc_html = f"<h2>{lesson_name}</h2>"
                    desc_html += f"<p>メンタリング形式の演習です。メンターと一緒に取り組みます。</p>"

                    escaped = desc_html.replace("'", "''")
                    update_sql = f"""
                    UPDATE lessons SET
                        markdown_content = '{escaped}',
                        content_format = 'html',
                        updated_at = now()
                    WHERE id = '{lesson_id}'
                    """
                    supabase_query(update_sql)
                    print(f"  ✅ {title} ← default description")
                    updated += 1
                    continue

            # C) ファーム演習系 (19-25): ファーム別情報からコンテンツを流用
            if any(firm in lesson_name for firm in ["McKinsey", "Boston", "Bain", "Kearney", "Strategy&", "Arthur", "Roland"]):
                # ファーム別情報コースからコンテンツを取得してセクション抽出
                content, fmt = get_standalone_content("ファーム別情報-選考フロー採用動向特色など")
                if content and len(content) > 20:
                    # ファーム演習の説明
                    firm_html = f"<h2>{lesson_name}</h2>"
                    firm_html += f"<p>{lesson_name}のケース面接に特化した実践演習です。メンターと一緒に取り組みます。</p>"
                    firm_html += f"<p>詳細は「ファーム別情報」コースを参照してください。</p>"

                    escaped = firm_html.replace("'", "''")
                    update_sql = f"""
                    UPDATE lessons SET
                        markdown_content = '{escaped}',
                        content_format = 'html',
                        updated_at = now()
                    WHERE id = '{lesson_id}'
                    """
                    supabase_query(update_sql)
                    print(f"  ✅ {title} ← firm exercise description")
                    updated += 1
                    continue

            # D) その他（イベント、テスト等）
            if any(kw in lesson_name for kw in ["対策会", "模擬面接テスト", "辞書"]):
                desc_html = f"<h2>{lesson_name}</h2>"
                if "対策会" in lesson_name:
                    desc_html += "<p>グループ対策会形式の演習です。詳細はメンターからご案内します。</p>"
                elif "模擬面接テスト" in lesson_name:
                    desc_html += "<p>本番形式の模擬面接テストです。メンターが面接官役を務めます。</p>"
                elif "辞書" in lesson_name:
                    desc_html += "<p>戦コン就活で頻出する用語集です。</p>"

                escaped = desc_html.replace("'", "''")
                update_sql = f"""
                UPDATE lessons SET
                    markdown_content = '{escaped}',
                    content_format = 'html',
                    updated_at = now()
                WHERE id = '{lesson_id}'
                """
                supabase_query(update_sql)
                print(f"  ✅ {title} ← event/test description")
                updated += 1
                continue

            if has_content:
                # 既にコンテンツがあるレッスンは content_format を html に更新
                update_sql = f"""
                UPDATE lessons SET content_format = 'html', updated_at = now()
                WHERE id = '{lesson_id}' AND content_format != 'html'
                """
                supabase_query(update_sql)
                print(f"  ⏭️  {title} (already has content)")
            else:
                print(f"  ⚠️  {title} — no content source found")

        print(f"  📊 {updated}/{len(lessons)} updated")

    # 3. 中途ポータル用のコンテンツも同様に処理
    # 中途は単独コースの集合なので、既に移行済み

    print("\n" + "=" * 60)
    print("✅ カリキュラムコンテンツコピー完了")
    print("=" * 60)


if __name__ == "__main__":
    main()
