#!/usr/bin/env python3
"""
レッスンコンテンツ修正スクリプト
- 空/不足コンテンツをNotionから再取得
- 異常に大きいコンテンツ(>100K字)を適切なサイズに再取得
- 画像・見出し・引用等のMarkdown要素を正しく変換
"""

import os
import sys
import time
import re
import json
import requests
from typing import Optional

# ============================================
# Config
# ============================================

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
if not NOTION_TOKEN:
    print("ERROR: NOTION_TOKEN environment variable required")
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://plrmqgcigzjuiovsbggf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable required")
    sys.exit(1)

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Notion page IDs for problematic content
PAGES_TO_REFETCH = {
    # Empty テキスト
    "解いておきたいケース問題リスト": "19442aed-d74b-80b6-9456-c562dc1eed46",
    "マッキンゼーWebテスト対策": "19442aed-d74b-8012-a35c-c9d42e2d6c34",
    "課題別「筋の良い打ち手」の方向性": "19442aed-d74b-809f-ad89-eef12520e104",
    # Short テキスト
    "ケース面接の教科書（2025最新版）": "1eb42aed-d74b-804b-bcd9-cb4f34ef6189",
    "マッキンゼー/論点設計の教科書": "1b942aed-d74b-8094-a20c-c788bd02a921",
}

# 新卒カリキュラムDBからの再取得対象
SHINSOTSU_DBS = {
    "standard": "2bc42aed-d74b-80c8-9783-d5796aefab46",
    "minimum": "2cb42aed-d74b-812d-8984-cdf56a2189be",
    "senkomu": "2c442aed-d74b-818d-a70a-ecb5e9b5cc48",
}

# ============================================
# Notion API (reuse from seed script)
# ============================================

REQUEST_TIMEOUT = 30

def notion_get(url: str, retries: int = 3) -> dict:
    time.sleep(0.2)
    try:
        r = requests.get(url, headers=NOTION_HEADERS, timeout=REQUEST_TIMEOUT)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
        if retries > 0:
            print(f" [retry]", end="", flush=True)
            time.sleep(2)
            return notion_get(url, retries - 1)
        return {"results": [], "has_more": False}
    if r.status_code == 429:
        wait = int(r.headers.get("Retry-After", 2))
        time.sleep(wait)
        return notion_get(url, retries)
    if r.status_code in (500, 502, 503, 504):
        if retries > 0:
            time.sleep(2)
            return notion_get(url, retries - 1)
        return {"results": [], "has_more": False}
    r.raise_for_status()
    return r.json()


MAX_BLOCKS = 300  # Safety limit per page (reduced for targeted fetch)
MAX_CHARS = 80000  # Max chars per lesson

def get_blocks(block_id: str, depth: int = 0, _count: list = None) -> list:
    if _count is None:
        _count = [0]
    if depth > 1:  # Max depth = 1 (top-level + 1 child level)
        return []
    blocks = []
    cursor = None
    while True:
        if _count[0] >= MAX_BLOCKS:
            print(f" [max {MAX_BLOCKS} blocks reached]", end="", flush=True)
            break
        url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        data = notion_get(url)
        for b in data.get("results", []):
            _count[0] += 1
            blocks.append(b)
            if b.get("has_children") and b["type"] not in ("child_page", "child_database", "column_list", "table"):
                children = get_blocks(b["id"], depth + 1, _count)
                blocks.extend(children)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return blocks


# ============================================
# Blocks → Markdown
# ============================================

def rich_text_to_markdown(rich_text: list) -> str:
    result = ""
    for segment in rich_text:
        text = segment.get("plain_text", "")
        annotations = segment.get("annotations", {})
        href = segment.get("href") or (segment.get("text", {}).get("link") or {}).get("url")
        if annotations.get("bold"):
            text = f"**{text}**"
        if annotations.get("italic"):
            text = f"*{text}*"
        if annotations.get("code"):
            text = f"`{text}`"
        if annotations.get("strikethrough"):
            text = f"~~{text}~~"
        if href:
            text = f"[{text}]({href})"
        result += text
    return result


def download_and_upload_image(img_url: str, lesson_id: str, idx: int) -> str:
    """Download image from Notion and upload to Supabase Storage.
    Returns the public URL."""
    try:
        r = requests.get(img_url, timeout=30)
        if r.status_code != 200:
            print(f"      [img download failed: {r.status_code}]", end="", flush=True)
            return img_url  # fallback to original

        # Detect content type
        content_type = r.headers.get("Content-Type", "image/png")
        ext = "png"
        if "jpeg" in content_type or "jpg" in content_type:
            ext = "jpg"
        elif "gif" in content_type:
            ext = "gif"
        elif "webp" in content_type:
            ext = "webp"
        elif "svg" in content_type:
            ext = "svg"

        filename = f"lessons/{lesson_id}/{idx}.{ext}"

        # Upload to Supabase Storage (bucket: lms-content)
        upload_url = f"{SUPABASE_URL}/storage/v1/object/lms-content/{filename}"
        upload_headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        ur = requests.post(upload_url, headers=upload_headers, data=r.content, timeout=30)
        if ur.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/lms-content/{filename}"
            print(f" [img✓]", end="", flush=True)
            return public_url
        else:
            # Storage bucket might not exist, try creating it
            if ur.status_code == 404 or "not found" in ur.text.lower():
                create_r = requests.post(
                    f"{SUPABASE_URL}/storage/v1/bucket",
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={"id": "lms-content", "name": "lms-content", "public": True},
                    timeout=10,
                )
                if create_r.status_code in (200, 201, 409):  # 409 = already exists
                    ur2 = requests.post(upload_url, headers=upload_headers, data=r.content, timeout=30)
                    if ur2.status_code in (200, 201):
                        public_url = f"{SUPABASE_URL}/storage/v1/object/public/lms-content/{filename}"
                        print(f" [img✓]", end="", flush=True)
                        return public_url

            print(f" [upload failed:{ur.status_code}]", end="", flush=True)
            return img_url
    except Exception as e:
        print(f" [img err:{e}]", end="", flush=True)
        return img_url


# Global counter for image numbering per lesson
_current_lesson_id = ""
_img_counter = 0

def blocks_to_markdown(blocks: list, lesson_id: str = "") -> tuple:
    """Convert blocks to (markdown, video_urls, image_urls)."""
    global _current_lesson_id, _img_counter  # noqa
    if lesson_id != _current_lesson_id:
        _current_lesson_id = lesson_id
        _img_counter = 0

    lines = []
    video_urls = []
    image_urls = []

    for b in blocks:
        btype = b["type"]

        if btype == "paragraph":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(text)
            lines.append("")

        elif btype == "heading_1":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"# {text}")
            lines.append("")

        elif btype == "heading_2":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"## {text}")
            lines.append("")

        elif btype == "heading_3":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"### {text}")
            lines.append("")

        elif btype == "bulleted_list_item":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"- {text}")

        elif btype == "numbered_list_item":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"1. {text}")

        elif btype == "to_do":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            checked = "x" if b[btype].get("checked") else " "
            lines.append(f"- [{checked}] {text}")

        elif btype == "toggle":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"<details><summary>{text}</summary>")
            lines.append("")
            lines.append("</details>")
            lines.append("")

        elif btype == "callout":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            icon = b[btype].get("icon", {}).get("emoji", "💡")
            lines.append(f"> {icon} {text}")
            lines.append("")

        elif btype == "quote":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lines.append(f"> {text}")
            lines.append("")

        elif btype == "code":
            text = rich_text_to_markdown(b[btype].get("rich_text", []))
            lang = b[btype].get("language", "")
            lines.append(f"```{lang}")
            lines.append(text)
            lines.append("```")
            lines.append("")

        elif btype == "divider":
            lines.append("---")
            lines.append("")

        elif btype == "bookmark":
            url = b[btype].get("url", "")
            caption = rich_text_to_markdown(b[btype].get("caption", []))
            if url:
                label = caption or url
                lines.append(f"[{label}]({url})")
                lines.append("")

        elif btype == "embed":
            url = b[btype].get("url", "")
            if url:
                lines.append(f"[埋め込み: {url}]({url})")
                lines.append("")

        elif btype == "video":
            ext = b[btype].get("external", {}).get("url", "")
            file_url = (b[btype].get("file") or {}).get("url", "")
            video_url = ext or file_url
            if video_url:
                video_urls.append(video_url)

        elif btype == "image":
            ext_url = (b[btype].get("external") or {}).get("url", "")
            file_url = (b[btype].get("file") or {}).get("url", "")
            img_url = ext_url or file_url
            if img_url:
                caption = rich_text_to_markdown(b[btype].get("caption", []))
                # Notion file URLs are temporary; download and re-upload
                if "secure.notion-static.com" in img_url or "prod-files-secure" in img_url:
                    _img_counter = _img_counter + 1
                    img_url = download_and_upload_image(img_url, _current_lesson_id, _img_counter)
                lines.append(f"![{caption}]({img_url})")
                lines.append("")
                image_urls.append(img_url)

        elif btype == "table":
            # テーブルの子ブロック(table_row)を処理
            pass

        elif btype == "table_row":
            cells = b[btype].get("cells", [])
            row_texts = [rich_text_to_markdown(cell) for cell in cells]
            lines.append("| " + " | ".join(row_texts) + " |")

        elif btype in ("child_page", "child_database", "column_list", "column"):
            pass

    markdown = "\n".join(lines)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip(), video_urls, image_urls


# ============================================
# Supabase
# ============================================

def supabase_get(path: str, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.get(url, headers=SUPABASE_HEADERS, params=params)
    if r.status_code >= 400:
        print(f"  ❌ GET {path}: {r.status_code}")
        return []
    return r.json() if r.text else []


def supabase_patch(path: str, data: dict, params: dict = None) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.patch(url, headers=SUPABASE_HEADERS, json=data, params=params)
    if r.status_code >= 400:
        print(f"  ❌ PATCH {path}: {r.status_code} {r.text[:200]}")
        return False
    return True


# ============================================
# Main
# ============================================

def fetch_and_update_lesson(lesson_id: str, title: str, page_id: str):
    """Fetch content from Notion page and update lesson in Supabase."""
    print(f"\n📄 {title}")
    print(f"   Notion page: {page_id}")

    blocks = get_blocks(page_id)
    print(f"   Blocks: {len(blocks)}")

    markdown, video_urls, image_urls = blocks_to_markdown(blocks, lesson_id)

    # Truncate if still too large
    if len(markdown) > MAX_CHARS:
        print(f"   ⚠️ Content too large ({len(markdown):,}字), truncating to {MAX_CHARS:,}字")
        markdown = markdown[:MAX_CHARS] + "\n\n---\n*（以下省略）*"

    print(f"   Markdown: {len(markdown):,}字 | Videos: {len(video_urls)} | Images: {len(image_urls)}")

    if len(markdown) > 100000:
        print(f"   🔴 WARNING: Content exceeds 100K chars ({len(markdown):,}字) - PLEASE CHECK")

    update_data = {"markdown_content": markdown}
    if video_urls:
        update_data["video_url"] = video_urls[0]

    ok = supabase_patch("lessons", update_data, params={"id": f"eq.{lesson_id}"})
    if ok:
        print(f"   ✅ Updated")
    return ok


def main():
    print("=" * 60)
    print("レッスンコンテンツ修正スクリプト")
    print("=" * 60)

    # Step 1: 全レッスン取得
    print("\n📋 Supabaseから全レッスン取得...")
    lessons = supabase_get("lessons", params={
        "select": "id,title,lesson_type,markdown_content,video_url,course_id",
        "order": "sort_order",
    })
    print(f"   {len(lessons)} lessons found")

    # Step 2: 問題レッスン特定
    to_fix = []
    bloated = []

    for lesson in lessons:
        mc_len = len(lesson.get("markdown_content") or "")
        lt = lesson.get("lesson_type") or ""
        title = lesson.get("title") or ""

        # 模擬面接/ケース演習はスキップ
        if lt in ("模擬面接", "ケース演習"):
            continue

        # 異常に大きい → 再取得
        if mc_len > 100000:
            bloated.append(lesson)
        # 空 or 極端に短いテキスト → 再取得
        elif lt == "テキスト" and mc_len < 200:
            to_fix.append(lesson)

    print(f"\n🔧 修正対象:")
    print(f"   Empty/Short テキスト: {len(to_fix)}")
    print(f"   Bloated (>100K字): {len(bloated)}")

    # Step 3: Notion page IDとのマッチング
    # タイトルベースでNotionページIDを検索
    fixed_count = 0
    skipped = []

    # 3a. Empty/Short テキストの修正
    print("\n" + "=" * 40)
    print("Phase 1: Empty/Short テキスト修正")
    print("=" * 40)

    for lesson in to_fix:
        title = lesson["title"]
        lesson_id = lesson["id"]

        # PAGES_TO_REFETCH から Notion page IDを探す
        page_id = None
        for name, pid in PAGES_TO_REFETCH.items():
            if name in title or title in name:
                page_id = pid
                break

        # 番号付きカリキュラム項目の場合
        if not page_id and re.match(r"^\d+\.", title):
            # 新卒カリキュラムから探す必要がある
            skipped.append((lesson_id, title, "カリキュラム項目 - 別途処理"))
            continue

        if not page_id:
            skipped.append((lesson_id, title, "Notion page ID不明"))
            continue

        fetch_and_update_lesson(lesson_id, title, page_id)
        fixed_count += 1

    # 3b. Bloated コンテンツの修正
    print("\n" + "=" * 40)
    print("Phase 2: Bloated コンテンツ修正 (>100K字)")
    print("=" * 40)

    # Bloatedレッスンは新卒カリキュラムの項目
    # フェルミ推定Ⅰ → カリキュラムDBのページ
    # 利益向上 → カリキュラムDBのページ
    # これらはNotionの子ページに教科書全文が埋め込まれている
    # → 子ページを無視して、トップレベルの指示テキストだけ取得

    for lesson in bloated:
        title = lesson["title"]
        lesson_id = lesson["id"]
        mc_len = len(lesson.get("markdown_content") or "")
        print(f"\n🔴 {title} ({mc_len:,}字)")

        # このレッスンのNotionページを新卒カリキュラムDBから検索
        found = False
        for db_name, db_id in SHINSOTSU_DBS.items():
            if found:
                break
            print(f"   Searching {db_name} DB...")
            pages = query_db_for_title(db_id, title)
            if pages:
                page = pages[0]
                page_id = page["id"]
                print(f"   Found in {db_name}: {page_id}")

                # depth=0で取得（子ページの中身は取得しない）
                blocks = get_blocks_shallow(page_id)
                print(f"   Blocks (shallow): {len(blocks)}")

                markdown, video_urls, image_urls = blocks_to_markdown(blocks, lesson_id)

                if len(markdown) > MAX_CHARS:
                    markdown = markdown[:MAX_CHARS] + "\n\n---\n*（以下省略）*"

                print(f"   New content: {len(markdown):,}字")

                if len(markdown) > 100000:
                    print(f"   ⚠️ Still >100K字 after shallow fetch. Truncating.")
                    markdown = markdown[:50000] + "\n\n---\n*（以下省略 - 全文はNotionを参照してください）*"

                update_data = {"markdown_content": markdown}
                ok = supabase_patch("lessons", update_data, params={"id": f"eq.{lesson_id}"})
                if ok:
                    print(f"   ✅ Updated ({len(markdown):,}字)")
                    fixed_count += 1
                found = True

        if not found:
            # 直接ページIDで試す
            print(f"   DB検索でヒットなし。タイトル簡易マッチでスキップ。")
            # Truncate existing content
            existing = lesson.get("markdown_content") or ""
            if len(existing) > MAX_CHARS:
                truncated = existing[:50000] + "\n\n---\n*（以下省略 - 全文はNotionを参照してください）*"
                ok = supabase_patch("lessons", {"markdown_content": truncated}, params={"id": f"eq.{lesson_id}"})
                if ok:
                    print(f"   ✅ Truncated to {len(truncated):,}字")
                    fixed_count += 1

    # Summary
    print("\n" + "=" * 60)
    print(f"完了: {fixed_count} lessons updated")
    if skipped:
        print(f"\nスキップ ({len(skipped)}件):")
        for lid, t, reason in skipped:
            print(f"  - {t}: {reason}")
    print("=" * 60)


def query_db_for_title(db_id: str, target_title: str) -> list:
    """Search Notion database for a page with matching title."""
    # Clean title: remove leading number like "7." or "15."
    clean_title = re.sub(r"^\d+\.\s*", "", target_title)

    body = {
        "page_size": 10,
        "filter": {
            "property": "名前",
            "title": {"contains": clean_title}
        }
    }
    time.sleep(0.2)
    try:
        r = requests.post(
            f"https://api.notion.com/v1/databases/{db_id}/query",
            headers=NOTION_HEADERS,
            json=body,
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code >= 400:
            return []
        return r.json().get("results", [])
    except Exception:
        return []


def get_blocks_shallow(block_id: str) -> list:
    """Get only top-level blocks (no recursion into children)."""
    blocks = []
    cursor = None
    count = 0
    while True:
        if count >= MAX_BLOCKS:
            break
        url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        data = notion_get(url)
        for b in data.get("results", []):
            count += 1
            # Skip child_page and child_database entirely
            if b["type"] in ("child_page", "child_database"):
                continue
            blocks.append(b)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return blocks


if __name__ == "__main__":
    main()
