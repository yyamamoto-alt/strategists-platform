#!/usr/bin/env python3
"""
Notion → LMS コンテンツ移行スクリプト
全ての教科書・動画講座・補助教材をNotionから取得し、HTMLに変換してLMSに流し込む
"""

import json
import os
import requests
import time
import sys
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

# ============================
# Notion Page ID → LMS Course slug マッピング（教科書等の単独コース）
# ============================
STANDALONE_MAPPINGS = {
    # 教科書・教材系
    "1eb42aed-d74b-804b-bcd9-cb4f34ef6189": "ケース面接の教科書-2025最新版",
    "19442aed-d74b-8047-bc21-c7a06f87f3df": "フェルミ推定の教科書-完全版",
    "21d42aed-d74b-80b0-845d-ea45b5322cf5": "総コン内定の教科書",
    "19442aed-d74b-80f3-bc07-f3670e7b27b9": "ジョブの教科書-完全版-新卒向け",
    "1b942aed-d74b-8094-a20c-c788bd02a921": "マッキンゼー-論点設計の教科書",
    "20e42aed-d74b-808a-a1df-ca3b9b92b052": "推奨学習方法",

    # 補助教材系
    "19442aed-d74b-809f-ad89-eef12520e104": "課題別筋の良い打ち手の方向性",
    "19442aed-d74b-80b6-9456-c562dc1eed46": "解いておきたいケース問題リスト",
    "19442aed-d74b-804b-8339-d5d64378aae5": "推奨図書リスト",
    "1b842aed-d74b-80b6-8ca7-f699fee08c64": "筋の良い仮説創出のための分析観点",
    "1bb42aed-d74b-801d-af87-ef9affaedfcf": "業界・商材別キードライバー一覧",
    "1f442aed-d74b-8085-8bad-cf956ea817b9": "mck選考におけるよくある質問",
    "19442aed-d74b-80af-8618-d9613a754312": "ファーム別情報-選考フロー採用動向特色など",
    "19442aed-d74b-8012-a35c-c9d42e2d6c34": "マッキンゼーwebテスト対策",
}

# 動画講座（Notion上でchild_pageに分かれている場合はポータルページから取得）
VIDEO_COURSE_MAPPINGS = {
    "19442aed-d74b-807c-bf0a-eb9a05454163": "ケース面接対策動画講座",
    "19442aed-d74b-80a0-b3c3-fad1a11385c5": "フェルミ推定対策動画講座",
}

# ============================
# Notion API helpers
# ============================

def notion_get(url, params=None):
    """Notion APIリクエスト（レート制限対応）"""
    for attempt in range(3):
        resp = requests.get(url, headers=NOTION_HEADERS, params=params)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 2))
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        if resp.status_code != 200:
            print(f"  Warning: {url} returned {resp.status_code}: {resp.text[:200]}")
            return None
        return resp.json()
    return None


def fetch_all_blocks(page_id):
    """ページの全ブロックを取得（ページネーション対応）"""
    blocks = []
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    has_more = True
    start_cursor = None

    while has_more:
        params = {"page_size": 100}
        if start_cursor:
            params["start_cursor"] = start_cursor

        data = notion_get(url, params)
        if not data:
            break

        blocks.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
        time.sleep(0.35)  # Rate limit safety

    return blocks


def fetch_blocks_recursive(page_id, depth=0):
    """ブロックを再帰的に取得（子ブロック含む）"""
    if depth > 5:
        return []

    blocks = fetch_all_blocks(page_id)
    result = []

    for block in blocks:
        result.append(block)
        if block.get("has_children") and block["type"] not in ("child_page", "child_database"):
            children = fetch_blocks_recursive(block["id"], depth + 1)
            block["_children"] = children

    return result


# ============================
# Notion Block → HTML 変換
# ============================

def rich_text_to_html(rich_texts):
    """Notion rich_text配列をHTMLに変換"""
    if not rich_texts:
        return ""

    parts = []
    for rt in rich_texts:
        text = rt.get("plain_text", "")
        if not text:
            continue

        # HTMLエスケープ
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        annotations = rt.get("annotations", {})
        href = rt.get("href")

        # アノテーション適用
        if annotations.get("bold"):
            text = f"<strong>{text}</strong>"
        if annotations.get("italic"):
            text = f"<em>{text}</em>"
        if annotations.get("underline"):
            text = f"<u>{text}</u>"
        if annotations.get("strikethrough"):
            text = f"<s>{text}</s>"
        if annotations.get("code"):
            text = f"<code>{text}</code>"

        # カラー（背景色はNotionで重要な場合がある）
        color = annotations.get("color", "default")
        if color and color != "default":
            if "_background" in color:
                base = color.replace("_background", "")
                color_map = {
                    "red": "#fca5a5", "blue": "#93c5fd", "green": "#86efac",
                    "yellow": "#fde047", "orange": "#fdba74", "purple": "#c4b5fd",
                    "pink": "#f9a8d4", "gray": "#d1d5db", "brown": "#d6bcab",
                }
                bg = color_map.get(base, "")
                if bg:
                    text = f'<span style="background-color:{bg};padding:2px 4px;border-radius:3px">{text}</span>'
            else:
                color_map = {
                    "red": "#ef4444", "blue": "#3b82f6", "green": "#22c55e",
                    "yellow": "#eab308", "orange": "#f97316", "purple": "#8b5cf6",
                    "pink": "#ec4899", "gray": "#6b7280", "brown": "#92400e",
                }
                c = color_map.get(color, "")
                if c:
                    text = f'<span style="color:{c}">{text}</span>'

        # リンク
        if href:
            text = f'<a href="{href}" target="_blank" rel="noopener noreferrer">{text}</a>'

        parts.append(text)

    return "".join(parts)


def blocks_to_html(blocks):
    """ブロック配列をHTMLに変換"""
    html_parts = []
    list_buffer = []
    list_type = None

    def flush_list():
        nonlocal list_buffer, list_type
        if list_buffer:
            tag = "ol" if list_type == "numbered" else "ul"
            items = "\n".join(list_buffer)
            html_parts.append(f"<{tag}>\n{items}\n</{tag}>")
            list_buffer = []
            list_type = None

    for block in blocks:
        btype = block["type"]

        # リスト以外が来たらリストをフラッシュ
        if btype not in ("bulleted_list_item", "numbered_list_item"):
            flush_list()

        if btype == "paragraph":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            if text:
                # YouTube URL を自動埋め込み
                stripped = text.strip()
                url_match = re.match(r'^<a href="(https?://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([^"&]+))"[^>]*>[^<]*</a>$', stripped)
                if url_match:
                    vid = url_match.group(2).split("&")[0].split("?")[0]
                    if vid and re.match(r'^[A-Za-z0-9_-]+$', vid):
                        html_parts.append(f'<div data-youtube-video><iframe src="https://www.youtube.com/embed/{vid}" width="640" height="360" allowfullscreen></iframe></div>')
                        continue
                html_parts.append(f"<p>{text}</p>")
            else:
                html_parts.append("<p></p>")

        elif btype in ("heading_1", "heading_2", "heading_3"):
            level = btype[-1]
            text = rich_text_to_html(block[btype].get("rich_text", []))
            html_parts.append(f"<h{level}>{text}</h{level}>")

        elif btype == "bulleted_list_item":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            list_type = "bulleted"
            list_buffer.append(f"<li>{text}{children_html}</li>")

        elif btype == "numbered_list_item":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            list_type = "numbered"
            list_buffer.append(f"<li>{text}{children_html}</li>")

        elif btype == "to_do":
            checked = block[btype].get("checked", False)
            text = rich_text_to_html(block[btype].get("rich_text", []))
            checkbox = "☑" if checked else "☐"
            html_parts.append(f"<p>{checkbox} {text}</p>")

        elif btype == "toggle":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(f"<details><summary><strong>{text}</strong></summary>{children_html}</details>")

        elif btype == "code":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            lang = block[btype].get("language", "")
            html_parts.append(f"<pre><code>{text}</code></pre>")

        elif btype == "quote":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(f"<blockquote>{text}{children_html}</blockquote>")

        elif btype == "callout":
            text = rich_text_to_html(block[btype].get("rich_text", []))
            icon = block[btype].get("icon", {})
            emoji = icon.get("emoji", "") if icon.get("type") == "emoji" else ""
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(f'<blockquote><p>{emoji} {text}</p>{children_html}</blockquote>')

        elif btype == "divider":
            html_parts.append("<hr>")

        elif btype == "image":
            img_data = block[btype]
            url = ""
            if img_data.get("type") == "external":
                url = img_data["external"]["url"]
            elif img_data.get("type") == "file":
                url = img_data["file"]["url"]
            caption = rich_text_to_html(img_data.get("caption", []))
            if url:
                html_parts.append(f'<img src="{url}" alt="{caption}">')
                if caption:
                    html_parts.append(f"<p><em>{caption}</em></p>")

        elif btype == "video":
            vid_data = block[btype]
            url = ""
            if vid_data.get("type") == "external":
                url = vid_data["external"]["url"]
            elif vid_data.get("type") == "file":
                url = vid_data["file"]["url"]
            if url:
                # YouTube
                yt_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]+)', url)
                if yt_match:
                    vid = yt_match.group(1)
                    html_parts.append(f'<div data-youtube-video><iframe src="https://www.youtube.com/embed/{vid}" width="640" height="360" allowfullscreen></iframe></div>')
                # Google Drive
                elif "drive.google.com" in url:
                    drive_match = re.search(r'drive\.google\.com/file/d/([^/]+)', url)
                    if drive_match:
                        fid = drive_match.group(1)
                        html_parts.append(f'<p><strong>🎦 動画:</strong> <a href="https://drive.google.com/file/d/{fid}/preview" target="_blank">Google Drive で視聴する</a></p>')
                    else:
                        html_parts.append(f'<p><strong>🎦 動画:</strong> <a href="{url}" target="_blank">動画を開く</a></p>')
                else:
                    html_parts.append(f'<p><strong>🎦 動画:</strong> <a href="{url}" target="_blank">動画を開く</a></p>')

        elif btype == "embed":
            url = block[btype].get("url", "")
            if url:
                yt_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]+)', url)
                if yt_match:
                    vid = yt_match.group(1)
                    html_parts.append(f'<div data-youtube-video><iframe src="https://www.youtube.com/embed/{vid}" width="640" height="360" allowfullscreen></iframe></div>')
                else:
                    html_parts.append(f'<p><a href="{url}" target="_blank">{url}</a></p>')

        elif btype == "bookmark":
            url = block[btype].get("url", "")
            caption = rich_text_to_html(block[btype].get("caption", []))
            if url:
                label = caption if caption else url
                html_parts.append(f'<p><a href="{url}" target="_blank">{label}</a></p>')

        elif btype == "table":
            children = block.get("_children", [])
            if children:
                has_header = block[btype].get("has_column_header", False)
                table_html = "<table>"
                for i, row in enumerate(children):
                    if row["type"] == "table_row":
                        cells = row["table_row"].get("cells", [])
                        tag = "th" if (i == 0 and has_header) else "td"
                        row_html = "<tr>"
                        for cell in cells:
                            cell_text = rich_text_to_html(cell)
                            row_html += f"<{tag}>{cell_text}</{tag}>"
                        row_html += "</tr>"
                        table_html += row_html
                table_html += "</table>"
                html_parts.append(table_html)

        elif btype == "column_list":
            children = block.get("_children", [])
            if children:
                for col in children:
                    if col.get("_children"):
                        html_parts.append(blocks_to_html(col["_children"]))

        elif btype == "child_page":
            # 子ページはリンクとして表示
            title = block[btype].get("title", "")
            html_parts.append(f'<p><strong>📄 {title}</strong></p>')

        elif btype == "child_database":
            pass  # DBはスキップ

        elif btype == "synced_block":
            children = block.get("_children", [])
            if children:
                html_parts.append(blocks_to_html(children))

        elif btype == "link_preview":
            url = block[btype].get("url", "")
            if url:
                html_parts.append(f'<p><a href="{url}" target="_blank">{url}</a></p>')

        elif btype == "file":
            file_data = block[btype]
            url = ""
            name = rich_text_to_html(file_data.get("caption", []))
            if file_data.get("type") == "external":
                url = file_data["external"]["url"]
            elif file_data.get("type") == "file":
                url = file_data["file"]["url"]
            if url:
                label = name if name else "ファイルをダウンロード"
                html_parts.append(f'<p>📎 <a href="{url}" target="_blank">{label}</a></p>')

        elif btype == "pdf":
            pdf_data = block[btype]
            url = ""
            if pdf_data.get("type") == "external":
                url = pdf_data["external"]["url"]
            elif pdf_data.get("type") == "file":
                url = pdf_data["file"]["url"]
            if url:
                html_parts.append(f'<p>📄 <a href="{url}" target="_blank">PDFを開く</a></p>')

        # else: 未対応ブロックタイプはスキップ

    flush_list()
    return "\n".join(html_parts)


# ============================
# Supabase helpers
# ============================

def supabase_query(sql):
    """Supabase Management APIでSQLクエリ実行"""
    resp = requests.post(
        SUPABASE_URL,
        headers={
            "Authorization": f"Bearer {SUPABASE_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
    )
    if resp.status_code != 200 and resp.status_code != 201:
        print(f"  SQL Error: {resp.status_code} {resp.text[:300]}")
        return None
    try:
        return resp.json()
    except:
        return []


def update_lesson_content(lesson_id, html_content):
    """レッスンのコンテンツをHTMLで更新"""
    # SQL インジェクション防止: シングルクォートをエスケープ
    escaped = html_content.replace("'", "''")
    sql = f"""
    UPDATE lessons
    SET markdown_content = '{escaped}',
        content_format = 'html',
        updated_at = now()
    WHERE id = '{lesson_id}'
    """
    result = supabase_query(sql)
    return result is not None


def get_lesson_by_course_slug(slug):
    """コースslugからレッスンを取得（単独コースは1レッスン=1コース）"""
    sql = f"""
    SELECT l.id, l.title FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE c.slug = '{slug}'
    ORDER BY l.sort_order
    LIMIT 1
    """
    result = supabase_query(sql)
    if result and len(result) > 0:
        return result[0]
    return None


def get_lessons_by_course_slug(slug):
    """コースslugからレッスン一覧を取得"""
    sql = f"""
    SELECT l.id, l.title, l.sort_order, l.lesson_type, l.video_url,
           m.title as module_title, m.sort_order as module_sort
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = l.course_id
    WHERE c.slug = '{slug}'
    ORDER BY m.sort_order, l.sort_order
    """
    return supabase_query(sql) or []


# ============================
# メイン移行処理
# ============================

def migrate_standalone_page(notion_page_id, course_slug):
    """単独コース（教科書等）のNotionページをLMSレッスンに移行"""
    lesson = get_lesson_by_course_slug(course_slug)
    if not lesson:
        print(f"  ❌ Lesson not found for slug: {course_slug}")
        return False

    print(f"  📖 Fetching Notion page {notion_page_id}...")
    blocks = fetch_blocks_recursive(notion_page_id)
    if not blocks:
        print(f"  ⚠️  No blocks found")
        return False

    html = blocks_to_html(blocks)
    if not html.strip():
        print(f"  ⚠️  Empty HTML output")
        return False

    print(f"  📝 Updating lesson {lesson['id']} ({lesson['title']})... ({len(html)} chars)")
    success = update_lesson_content(lesson["id"], html)
    if success:
        print(f"  ✅ Done")
    else:
        print(f"  ❌ Update failed")
    return success


def migrate_video_course(notion_page_id, course_slug):
    """動画講座のNotionページをLMSに移行（子ページ=各回）"""
    lessons = get_lessons_by_course_slug(course_slug)
    if not lessons:
        print(f"  ❌ No lessons found for slug: {course_slug}")
        return False

    # Notionの子ブロックを取得（動画講座は各回がセクションになっている）
    print(f"  📖 Fetching video course page {notion_page_id}...")
    blocks = fetch_blocks_recursive(notion_page_id)
    if not blocks:
        print(f"  ⚠️  No blocks found")
        return False

    # 全体のHTMLを生成して、最初のレッスンに入れる
    # （動画講座は各回のvideo_urlが既に設定されているので、概要説明テキストのみ移行）
    html = blocks_to_html(blocks)
    if html.strip():
        # 最初のレッスンが概要の場合はそこに入れる
        first_lesson = lessons[0]
        print(f"  📝 Updating video course overview for {first_lesson['title']}... ({len(html)} chars)")
        update_lesson_content(first_lesson["id"], html)

    # 各レッスンに対応する子ページがあれば個別に取得
    child_pages = [b for b in blocks if b["type"] == "child_page"]
    for child in child_pages:
        child_title = child["child_page"]["title"]
        child_id = child["id"]

        # タイトルでレッスンを検索
        matching = [l for l in lessons if child_title in l["title"] or l["title"] in child_title]
        if matching:
            lesson = matching[0]
            print(f"  📖 Fetching child page: {child_title}...")
            child_blocks = fetch_blocks_recursive(child_id)
            if child_blocks:
                child_html = blocks_to_html(child_blocks)
                if child_html.strip():
                    print(f"  📝 Updating {lesson['title']}... ({len(child_html)} chars)")
                    update_lesson_content(lesson["id"], child_html)

    print(f"  ✅ Video course done")
    return True


def migrate_curriculum_lessons():
    """新卒カリキュラムの各レッスンのコンテンツを移行"""
    # 各カリキュラムポータルの子ページを取得し、レッスンにマッピング
    curriculum_portals = {
        "2bc42aed-d74b-80e9-ac9e-c8043bd6efe6": "shinsotsu-standard-light",
        "2cb42aed-d74b-80f6-8418-e3e1696f9cd4": "shinsotsu-minimum",
        "2c442aed-d74b-806c-aaae-d89c220c9b71": "shinsotsu-senkomu",
    }

    for portal_id, course_slug in curriculum_portals.items():
        print(f"\n🎓 Processing curriculum: {course_slug}")
        lessons = get_lessons_by_course_slug(course_slug)
        if not lessons:
            print(f"  ❌ No lessons found")
            continue

        # ポータルページの子ブロック取得
        blocks = fetch_all_blocks(portal_id)
        if not blocks:
            print(f"  ⚠️  No blocks found in portal")
            continue

        # 各レッスンを処理
        # カリキュラムのレッスンは教科書コースへの参照が多い
        # ポータル内のchild_pageやリンクからコンテンツを取得
        child_pages = [b for b in blocks if b["type"] == "child_page"]

        for lesson in lessons:
            title = lesson["title"].strip()
            # 番号付きタイトルから番号を抽出
            num_match = re.match(r'^(\d+)\.\s*(.+)$', title)
            lesson_name = num_match.group(2).strip() if num_match else title

            # 教科書やテキスト系は既に単独コースとして移行済みなのでスキップ
            # ただし、content_urlとしてリンクを設定するか、レッスン説明を追加する
            # 実際のコンテンツはchild_pageやcurriculum DBのテキストフィールドから取得

            # ポータル内の子ページでタイトルが一致するものを探す
            matching_child = None
            for cp in child_pages:
                cp_title = cp["child_page"]["title"]
                if lesson_name in cp_title or cp_title in lesson_name:
                    matching_child = cp
                    break

            if matching_child:
                # 子ページの内容を取得
                print(f"  📖 Fetching content for: {title} (from child page)")
                time.sleep(0.35)
                child_blocks = fetch_blocks_recursive(matching_child["id"])
                if child_blocks:
                    html = blocks_to_html(child_blocks)
                    if html.strip():
                        print(f"  📝 Updating {title}... ({len(html)} chars)")
                        update_lesson_content(lesson["id"], html)
                        continue

            # マッチしない場合はスキップ（既に単独コースで移行済みの可能性）
            print(f"  ⏭️  Skipping {title} (no matching child page, may be standalone course)")


def migrate_additional_pages():
    """追加のNotionページ（ビヘイビア、教材アウトプットなど）"""
    additional_pages = {
        # ビヘイビア面接準備
        # 教材アウトプットについて
    }

    # 中途ポータルの主要セクションを取得
    print("\n📋 Fetching 【中途】ポータル structure...")
    portal_blocks = fetch_all_blocks("19442aed-d74b-8029-b7ca-eec1bd28d910")
    if not portal_blocks:
        print("  ⚠️  Could not fetch portal")
        return

    # child_pageを一覧表示して、マッチングを試みる
    child_pages = [b for b in portal_blocks if b["type"] == "child_page"]
    print(f"  Found {len(child_pages)} child pages in 中途ポータル")

    # 追加ページのマッピング
    additional_mappings = {}
    for cp in child_pages:
        cp_title = cp["child_page"]["title"]
        cp_id = cp["id"]

        # 既知のコースにマッピング
        slug_map = {
            "推薦学習方法": "推奨学習方法",
            "ケース面接の教科書（2025最新版）": "ケース面接の教科書-2025最新版",
            "フェルミ推定の教科書【完全版】": "フェルミ推定の教科書-完全版",
            "ケース面接対策動画講座": "ケース面接対策動画講座",
            "フェルミ推定対策動画講座": "フェルミ推定対策動画講座",
            "総コン内定の教科書": "総コン内定の教科書",
            "ジョブの教科書【完全版】(新卒向け)": "ジョブの教科書-完全版-新卒向け",
            "課題別「筋の良い打ち手」の方向性": "課題別筋の良い打ち手の方向性",
            "【必見】課題別「筋の良い打ち手」の方向性": "課題別筋の良い打ち手の方向性",
            "解いておきたいケース問題リスト": "解いておきたいケース問題リスト",
            "推薦図書リスト": "推奨図書リスト",
            "筋の良い仮説創出のための分析観点": "筋の良い仮説創出のための分析観点",
            "業界・商材別キードライバー一覧": "業界・商材別キードライバー一覧",
            "McK選考におけるよくある質問": "mck選考におけるよくある質問",
            "ファーム別情報（選考フロー、採用動向、特色など）": "ファーム別情報-選考フロー採用動向特色など",
            "マッキンゼーWebテスト対策": "マッキンゼーwebテスト対策",
        }

        for notion_title, slug in slug_map.items():
            if notion_title in cp_title or cp_title in notion_title:
                if cp_id not in [v for v in STANDALONE_MAPPINGS.keys()]:
                    additional_mappings[cp_id] = slug
                break

    # Webテスト対策（新卒/既卒）
    for cp in child_pages:
        title = cp["child_page"]["title"]
        if "Web対策" in title or "Webテスト" in title:
            if "新卒" in title:
                additional_mappings[cp["id"]] = "webテスト対策-新卒"
            elif "既卒" in title:
                additional_mappings[cp["id"]] = "webテスト対策-既卒"

    for page_id, slug in additional_mappings.items():
        lesson = get_lesson_by_course_slug(slug)
        if not lesson:
            continue
        print(f"  📖 Migrating additional page → {slug}")
        blocks = fetch_blocks_recursive(page_id)
        if blocks:
            html = blocks_to_html(blocks)
            if html.strip():
                print(f"  📝 Updating... ({len(html)} chars)")
                update_lesson_content(lesson["id"], html)
        time.sleep(0.35)


# ============================
# Main
# ============================

def main():
    print("=" * 60)
    print("🚀 Notion → LMS コンテンツ移行開始")
    print("=" * 60)

    # 1. 単独コース（教科書・補助教材）の移行
    print("\n📚 Step 1: 教科書・補助教材の移行")
    print("-" * 40)
    success_count = 0
    for notion_id, slug in STANDALONE_MAPPINGS.items():
        print(f"\n▶ {slug}")
        if migrate_standalone_page(notion_id, slug):
            success_count += 1
        time.sleep(0.5)
    print(f"\n📊 Step 1 完了: {success_count}/{len(STANDALONE_MAPPINGS)} 成功")

    # 2. 動画講座の移行
    print("\n🎬 Step 2: 動画講座の移行")
    print("-" * 40)
    for notion_id, slug in VIDEO_COURSE_MAPPINGS.items():
        print(f"\n▶ {slug}")
        migrate_video_course(notion_id, slug)
        time.sleep(0.5)

    # 3. 新卒カリキュラムの移行
    print("\n🎓 Step 3: 新卒カリキュラムの移行")
    print("-" * 40)
    migrate_curriculum_lessons()

    # 4. 追加ページの移行
    print("\n📋 Step 4: 追加ページの移行")
    print("-" * 40)
    migrate_additional_pages()

    print("\n" + "=" * 60)
    print("✅ 移行完了")
    print("=" * 60)


if __name__ == "__main__":
    main()
