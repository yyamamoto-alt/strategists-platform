#!/usr/bin/env python3
"""
Notion APIからカリキュラム・ポータルのコンテンツを取得してSupabaseに投入するスクリプト。

使用方法:
  export SUPABASE_SERVICE_ROLE_KEY="..."
  python3 scripts/seed-curriculum-from-notion.py

全ページのテキスト本文、動画URL、外部リンクを取得してLMSに投入します。
"""

import json
import os
import sys
import time
import re
import requests
from typing import Optional

# ============================================
# 設定
# ============================================
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://plrmqgcigzjuiovsbggf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_ROLE_KEY が設定されていません")
    sys.exit(1)

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ============================================
# 新卒カリキュラムDB IDs
# ============================================
SHINSOTSU_DBS = {
    "standard_light": "2bc42aed-d74b-80c8-9783-d5796aefab46",
    "minimum": "2cb42aed-d74b-812d-8984-cdf56a2189be",
    "senkomu": "2c442aed-d74b-818d-a70a-ecb5e9b5cc48",
}

# 中途ポータルの子ページID（実コンテンツ）
KISOTSU_PAGES = {
    # 教科書
    "ケース面接の教科書（2025最新版）": {
        "page_id": "1eb42aed-d74b-804b-bcd9-cb4f34ef6189",
        "category": "教科書",
        "target_plans": ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
    },
    "フェルミ推定の教科書【完全版】": {
        "page_id": "19442aed-d74b-8047-bc21-c7a06f87f3df",
        "category": "教科書",
        "target_plans": [],
    },
    "総コン内定の教科書": {
        "page_id": "21d42aed-d74b-80b0-845d-ea45b5322cf5",
        "category": "教科書",
        "target_plans": [],
    },
    # 動画講座
    "ケース面接対策動画講座": {
        "page_id": "19442aed-d74b-807c-bf0a-eb9a05454163",
        "category": "動画講座",
        "target_plans": [],
    },
    "フェルミ推定対策動画講座": {
        "page_id": "19442aed-d74b-80a0-b3c3-fad1a11385c5",
        "category": "動画講座",
        "target_plans": [],
    },
    # 補助教材
    "Webテスト対策(新卒)": {
        "page_id": "19442aed-d74b-8096-ae7e-fb2f2cf91948",
        "category": "補助教材",
        "target_plans": [],
    },
    "Webテスト対策(既卒)": {
        "page_id": "1f442aed-d74b-80e6-9c1a-cb3b56eff8f9",
        "category": "補助教材",
        "target_plans": [],
    },
    "課題別「筋の良い打ち手」の方向性": {
        "page_id": "19442aed-d74b-809f-ad89-eef12520e104",
        "category": "補助教材",
        "target_plans": [],
    },
    "解いておきたいケース問題リスト": {
        "page_id": "19442aed-d74b-80b6-9456-c562dc1eed46",
        "category": "補助教材",
        "target_plans": [],
    },
    "推奨図書リスト": {
        "page_id": "19442aed-d74b-804b-8339-d5d64378aae5",
        "category": "補助教材",
        "target_plans": [],
    },
    "筋の良い仮説創出のための分析観点": {
        "page_id": "1b842aed-d74b-80b6-8ca7-f699fee08c64",
        "category": "補助教材",
        "target_plans": [],
    },
    "業界・商材別キードライバー一覧": {
        "page_id": "1bb42aed-d74b-80f6-bd00-fc861f87f4c5",
        "category": "補助教材",
        "target_plans": [],
    },
    "ファーム別情報（選考フロー、採用動向、特色など）": {
        "page_id": "19442aed-d74b-80af-8618-d9613a754312",
        "category": "補助教材",
        "target_plans": [],
    },
    # McK限定
    "マッキンゼー/論点設計の教科書": {
        "page_id": "1b942aed-d74b-8094-a20c-c788bd02a921",
        "category": "教科書",
        "target_plans": ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
    },
    "ジョブの教科書【完全版】(新卒向け)": {
        "page_id": "19442aed-d74b-80f3-bc07-f3670e7b27b9",
        "category": "教科書",
        "target_plans": [],
    },
    "McK選考におけるよくある質問": {
        "page_id": "1f442aed-d74b-8085-8bad-cf956ea817b9",
        "category": "補助教材",
        "target_plans": ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
    },
    "マッキンゼーWebテスト対策": {
        "page_id": "19442aed-d74b-8012-a35c-c9d42e2d6c34",
        "category": "補助教材",
        "target_plans": ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
    },
    # プログラム関連
    "推奨学習方法": {
        "page_id": "20e42aed-d74b-808a-a1df-ca3b9b92b052",
        "category": "ガイド",
        "target_plans": [],
    },
    "教材アウトプットについて": {
        "page_id": "1ae42aed-d74b-80a1-bafe-c2ae9f90fe3f",
        "category": "ガイド",
        "target_plans": [],
    },
    "ビヘイビア面接準備にあたってのチェックポイント": {
        "page_id": "28a42aed-d74b-8082-a9ad-c66da9143d6a",
        "category": "補助教材",
        "target_plans": [],
    },
}

# Google Form URLs
FORM_URLS = {
    "教材アウトプットフォーム": "https://docs.google.com/forms/d/e/1FAIpQLScwjVOoTGOJFWMWBiQrYJqjGBfrgH4pEzm0hTefpdIde0ApuA/viewform?usp=dialog",
    "自己振り返りフォーム": "https://docs.google.com/forms/d/e/1FAIpQLSczLzNgT647SsVOy0dEma7u11WsUouNIabPrjMWJYOB9-iAtQ/viewform",
    "添削提出フォーム": "https://forms.gle/RUHphJLJzDBGEjro7",
    "面接振り返りフォーム": "https://forms.gle/aPrBN61BXQdm79Lr7",
    "ビヘイビア対策お申込みフォーム": "https://docs.google.com/forms/d/e/1FAIpQLSfdULLLNu3mPO3y0lAwpq8P-N3-gJnX7R1ozVqRbejdm594WQ/viewform",
}

# ============================================
# Notion API
# ============================================

REQUEST_TIMEOUT = 30  # seconds

def notion_get(url: str, retries: int = 3) -> dict:
    """Notion API GET request with rate limiting and retry on server errors."""
    time.sleep(0.15)
    try:
        r = requests.get(url, headers=NOTION_HEADERS, timeout=REQUEST_TIMEOUT)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
        if retries > 0:
            print(f" [retry]", end="", flush=True)
            time.sleep(2)
            return notion_get(url, retries - 1)
        print(f" [skip:timeout]", end="", flush=True)
        return {"results": [], "has_more": False}
    if r.status_code == 429:
        wait = int(r.headers.get("Retry-After", 2))
        time.sleep(wait)
        return notion_get(url, retries)
    if r.status_code in (500, 502, 503, 504):
        if retries > 0:
            print(f" [retry:{r.status_code}]", end="", flush=True)
            time.sleep(2)
            return notion_get(url, retries - 1)
        print(f" [skip:{r.status_code}]", end="", flush=True)
        return {"results": [], "has_more": False}
    r.raise_for_status()
    return r.json()


def notion_post(url: str, body: dict = None, retries: int = 3) -> dict:
    """Notion API POST request with rate limiting and retry on server errors."""
    time.sleep(0.15)
    try:
        r = requests.post(url, headers=NOTION_HEADERS, json=body or {}, timeout=REQUEST_TIMEOUT)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
        if retries > 0:
            print(f" [retry]", end="", flush=True)
            time.sleep(2)
            return notion_post(url, body, retries - 1)
        print(f" [skip:timeout]", end="", flush=True)
        return {"results": [], "has_more": False}
    if r.status_code == 429:
        wait = int(r.headers.get("Retry-After", 2))
        time.sleep(wait)
        return notion_post(url, body, retries)
    if r.status_code in (500, 502, 503, 504):
        if retries > 0:
            print(f" [retry:{r.status_code}]", end="", flush=True)
            time.sleep(2)
            return notion_post(url, body, retries - 1)
        print(f" [skip:{r.status_code}]", end="", flush=True)
        return {"results": [], "has_more": False}
    r.raise_for_status()
    return r.json()


def query_database(db_id: str) -> list:
    """Query all pages from a Notion database."""
    pages = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        data = notion_post(f"https://api.notion.com/v1/databases/{db_id}/query", body)
        pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return pages


MAX_BLOCKS_PER_PAGE = 500  # Safety limit

def get_blocks(block_id: str, depth: int = 0, _count: list = None) -> list:
    """Recursively get all blocks from a page/block."""
    if _count is None:
        _count = [0]
    if depth > 2:  # Max recursion depth (reduced from 3)
        return []
    blocks = []
    cursor = None
    while True:
        if _count[0] >= MAX_BLOCKS_PER_PAGE:
            print(f" [max {MAX_BLOCKS_PER_PAGE} blocks]", end="", flush=True)
            break
        url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        data = notion_get(url)
        for b in data.get("results", []):
            _count[0] += 1
            blocks.append(b)
            # Recursively get children if has_children (skip child_page/child_database and toggle for speed)
            if b.get("has_children") and b["type"] not in ("child_page", "child_database", "column_list", "table"):
                children = get_blocks(b["id"], depth + 1, _count)
                blocks.extend(children)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return blocks


# ============================================
# Blocks → Markdown 変換
# ============================================

def rich_text_to_markdown(rich_text: list) -> str:
    """Convert Notion rich_text array to markdown string."""
    result = ""
    for segment in rich_text:
        text = segment.get("plain_text", "")
        annotations = segment.get("annotations", {})
        href = segment.get("href") or (segment.get("text", {}).get("link") or {}).get("url")

        # Apply formatting
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


def blocks_to_markdown(blocks: list) -> tuple[str, list[str]]:
    """
    Convert Notion blocks to markdown string.
    Returns (markdown_text, video_urls).
    """
    lines = []
    video_urls = []

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
            lines.append(f"**{text}**")
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
            if url:
                lines.append(f"[{url}]({url})")
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
            ext = (b[btype].get("external") or {}).get("url", "")
            file_url = (b[btype].get("file") or {}).get("url", "")
            img_url = ext or file_url
            if img_url:
                caption = rich_text_to_markdown(b[btype].get("caption", []))
                lines.append(f"![{caption}]({img_url})")
                lines.append("")

        elif btype == "table":
            pass  # Skip tables for now

        elif btype in ("child_page", "child_database"):
            pass  # Skip child pages/databases

    # Clean up: remove excessive blank lines
    markdown = "\n".join(lines)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip(), video_urls


# ============================================
# Supabase API
# ============================================

def supabase_request(method: str, path: str, data: dict = None, params: dict = None) -> dict | list | None:
    """Make a Supabase REST API request."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.request(method, url, headers=SUPABASE_HEADERS, json=data, params=params)
    if r.status_code >= 400:
        print(f"  ❌ Supabase {method} {path}: {r.status_code} {r.text[:200]}")
        return None
    if r.text:
        return r.json()
    return None


def upsert_course(title: str, slug: str, category: str, description: str,
                  target_attr: str = None, sort_order: int = 0) -> Optional[str]:
    """Create or get existing course. Returns course ID."""
    # Check existing
    existing = supabase_request("GET", "courses", params={
        "slug": f"eq.{slug}",
        "select": "id",
    })
    if existing and len(existing) > 0:
        print(f"  📦 Course exists: {title}")
        return existing[0]["id"]

    result = supabase_request("POST", "courses", data={
        "title": title,
        "slug": slug,
        "category": category,
        "description": description,
        "target_attribute": target_attr,
        "sort_order": sort_order,
        "is_active": True,
        "status": "published",
        "level": "beginner",
        "total_lessons": 0,
    })
    if result and len(result) > 0:
        print(f"  ✅ Created course: {title}")
        return result[0]["id"]
    return None


def upsert_module(course_id: str, title: str, sort_order: int) -> Optional[str]:
    """Create or get existing module."""
    existing = supabase_request("GET", "modules", params={
        "course_id": f"eq.{course_id}",
        "title": f"eq.{title}",
        "select": "id",
    })
    if existing and len(existing) > 0:
        return existing[0]["id"]

    result = supabase_request("POST", "modules", data={
        "course_id": course_id,
        "title": title,
        "sort_order": sort_order,
    })
    if result and len(result) > 0:
        return result[0]["id"]
    return None


def upsert_lesson(course_id: str, module_id: str, title: str, lesson_type: str,
                  sort_order: int, video_url: str = None, markdown_content: str = None,
                  content_url: str = None, description: str = None) -> Optional[str]:
    """Create or get existing lesson."""
    existing = supabase_request("GET", "lessons", params={
        "course_id": f"eq.{course_id}",
        "title": f"eq.{title}",
        "select": "id",
    })
    if existing and len(existing) > 0:
        # Update content if exists
        lesson_id = existing[0]["id"]
        update_data = {}
        if markdown_content:
            update_data["markdown_content"] = markdown_content
        if video_url:
            update_data["video_url"] = video_url
        if content_url:
            update_data["content_url"] = content_url
        if update_data:
            supabase_request("PATCH", f"lessons?id=eq.{lesson_id}", data=update_data)
        return lesson_id

    result = supabase_request("POST", "lessons", data={
        "course_id": course_id,
        "module_id": module_id,
        "title": title,
        "lesson_type": lesson_type,
        "sort_order": sort_order,
        "is_active": True,
        "video_url": video_url,
        "markdown_content": markdown_content,
        "content_url": content_url,
        "description": description,
        "copy_protected": True,
    })
    if result and len(result) > 0:
        return result[0]["id"]
    return None


def set_plan_access(course_id: str, plan_slugs: list[str]):
    """Set plan access for a course."""
    if not plan_slugs:
        return  # Empty = all plans

    # Get plan IDs
    plans = supabase_request("GET", "plans", params={
        "slug": f"in.({','.join(plan_slugs)})",
        "select": "id,slug",
    })
    if not plans:
        return

    # Delete existing
    supabase_request("DELETE", f"course_plan_access?course_id=eq.{course_id}")

    # Insert new
    for p in plans:
        supabase_request("POST", "course_plan_access", data={
            "course_id": course_id,
            "plan_id": p["id"],
        })


def update_course_lesson_count(course_id: str):
    """Update total_lessons count on course."""
    lessons = supabase_request("GET", "lessons", params={
        "course_id": f"eq.{course_id}",
        "select": "id",
    })
    count = len(lessons) if lessons else 0
    supabase_request("PATCH", f"courses?id=eq.{course_id}", data={
        "total_lessons": count,
    })


# ============================================
# 教材種類マッピング
# ============================================

def map_lesson_type(material_type: str) -> str:
    mapping = {
        "教材": "テキスト",
        "教材+メンタリング": "テキスト",
        "動画講義": "動画",
        "特別メンタリング": "模擬面接",
        "限定イベント": "ケース演習",
    }
    return mapping.get(material_type, "テキスト")


# ============================================
# 新卒カリキュラム投入
# ============================================

def seed_shinsotsu():
    print("\n🎓 新卒カリキュラム投入開始...\n")

    plan_map = {
        "standard_light": (["shinsotsu_standard", "shinsotsu_light"], "新卒カリキュラム（スタンダード/ライト）"),
        "minimum": (["shinsotsu_minimum"], "新卒カリキュラム（ミニマム）"),
        "senkomu": (["shinsotsu_senkomu"], "新卒カリキュラム（選コミュ）"),
    }

    for key, db_id in SHINSOTSU_DBS.items():
        plan_slugs, course_name = plan_map[key]
        print(f"\n📚 {course_name} (DB: {db_id})")

        # Query database
        pages = query_database(db_id)
        print(f"  {len(pages)} entries found")

        course_slug = f"shinsotsu-{key.replace('_', '-')}"
        course_id = upsert_course(
            title=course_name,
            slug=course_slug,
            category="カリキュラム",
            description=f"{course_name} - {len(pages)}項目",
            target_attr="新卒",
            sort_order=100 + list(SHINSOTSU_DBS.keys()).index(key),
        )
        if not course_id:
            print(f"  ❌ Failed to create course")
            continue

        # Group by chapter
        chapters: dict[str, list] = {}
        for page in pages:
            props = page["properties"]
            chapter = ""
            if "チャプター" in props and props["チャプター"].get("select"):
                chapter = props["チャプター"]["select"]["name"]
            if not chapter:
                chapter = "その他"
            chapters.setdefault(chapter, []).append(page)

        # Chapter order
        chapter_order = ["基礎編", "実践編", "演習編", "フロー別対策", "模擬面接テスト", "補助教材", "その他"]

        lesson_sort = 0
        module_sort = 0
        for ch in chapter_order:
            if ch not in chapters:
                continue
            module_sort += 1
            module_id = upsert_module(course_id, ch, module_sort)
            if not module_id:
                continue

            # Sort pages by number prefix
            ch_pages = chapters[ch]
            ch_pages.sort(key=lambda p: int(
                re.match(r"(\d+)", "".join(
                    t["plain_text"] for t in p["properties"]["名前"].get("title", [])
                )).group(1)
                if re.match(r"(\d+)", "".join(
                    t["plain_text"] for t in p["properties"]["名前"].get("title", [])
                ))
                else 999
            ))

            for page in ch_pages:
                lesson_sort += 1
                title = "".join(t["plain_text"] for t in page["properties"]["名前"].get("title", []))
                material_type = ""
                if page["properties"].get("教材種類", {}).get("select"):
                    material_type = page["properties"]["教材種類"]["select"]["name"]
                lesson_type = map_lesson_type(material_type)

                # テキスト補足
                description_text = ""
                if page["properties"].get("テキスト", {}).get("rich_text"):
                    description_text = "".join(
                        t["plain_text"] for t in page["properties"]["テキスト"]["rich_text"]
                    )

                # ページのブロック（本文）を取得
                print(f"    📄 [{lesson_sort}] {title}...", end="", flush=True)
                sys.stdout.flush()
                blocks = get_blocks(page["id"])
                markdown, video_urls = blocks_to_markdown(blocks)

                video_url = video_urls[0] if video_urls else None
                # 動画講義の場合、本文にすべての動画URLを含める
                if len(video_urls) > 1:
                    for i, vu in enumerate(video_urls):
                        markdown += f"\n\n**動画{i+1}**: [{vu}]({vu})"

                upsert_lesson(
                    course_id=course_id,
                    module_id=module_id,
                    title=title,
                    lesson_type=lesson_type,
                    sort_order=lesson_sort,
                    video_url=video_url,
                    markdown_content=markdown if markdown else None,
                    description=description_text if description_text else None,
                )
                content_len = len(markdown) if markdown else 0
                print(f" {content_len} chars, {len(video_urls)} videos")

        update_course_lesson_count(course_id)
        set_plan_access(course_id, plan_slugs)
        print(f"  ✅ {course_name}: {lesson_sort} lessons")


# ============================================
# 中途ポータルコンテンツ投入
# ============================================

def seed_kisotsu():
    print("\n📖 中途ポータルコンテンツ投入開始...\n")

    sort_order = 200
    for title, config in KISOTSU_PAGES.items():
        sort_order += 1
        page_id = config["page_id"]
        category = config["category"]
        target_plans = config["target_plans"]

        slug = re.sub(r"[【】()（）/\s]+", "-", title).strip("-").lower()
        slug = re.sub(r"[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff-]", "", slug)
        if not slug:
            slug = f"kisotsu-{sort_order}"

        print(f"\n  📄 {title} ({page_id[:12]}...)", flush=True)

        # Fetch page blocks
        blocks = get_blocks(page_id)
        print(f"    → {len(blocks)} blocks fetched", flush=True)
        markdown, video_urls = blocks_to_markdown(blocks)
        print(f"    {len(blocks)} blocks, {len(markdown)} chars, {len(video_urls)} videos")

        # 動画講座の場合: 動画ごとにレッスンを分割
        if video_urls and category == "動画講座":
            course_id = upsert_course(
                title=title,
                slug=slug,
                category=category,
                description=f"{title}",
                target_attr="既卒",
                sort_order=sort_order,
            )
            if not course_id:
                continue

            module_id = upsert_module(course_id, title, 1)
            if not module_id:
                continue

            # マークダウンを動画ごとに分割
            sections = split_video_sections(markdown, video_urls)
            for i, (section_title, section_md, section_video) in enumerate(sections):
                upsert_lesson(
                    course_id=course_id,
                    module_id=module_id,
                    title=section_title,
                    lesson_type="動画",
                    sort_order=i + 1,
                    video_url=section_video,
                    markdown_content=section_md if section_md else None,
                )

            update_course_lesson_count(course_id)
            set_plan_access(course_id, target_plans)

        else:
            # テキスト系: 1コース = 1レッスン（本文全体）
            course_id = upsert_course(
                title=title,
                slug=slug,
                category=category,
                description=title,
                target_attr="既卒",
                sort_order=sort_order,
            )
            if not course_id:
                continue

            module_id = upsert_module(course_id, title, 1)
            if not module_id:
                continue

            upsert_lesson(
                course_id=course_id,
                module_id=module_id,
                title=title,
                lesson_type="テキスト",
                sort_order=1,
                markdown_content=markdown if markdown else None,
            )

            update_course_lesson_count(course_id)
            set_plan_access(course_id, target_plans)


def split_video_sections(markdown: str, video_urls: list[str]) -> list[tuple[str, str, str]]:
    """Split markdown content into sections based on video markers.
    Returns list of (title, markdown, video_url) tuples."""
    sections = []

    # Find section headers (◼︎第N講, ◼第N講, etc.)
    lines = markdown.split("\n")
    current_title = ""
    current_lines = []
    current_video_idx = 0

    for line in lines:
        # Check if this is a section header
        match = re.match(r"[◼︎◼️■●]*(第\d+講[：:\s]*.*?)$", line.strip())
        if not match:
            match = re.match(r"\*\*[◼︎◼️■●]*(第\d+講[：:\s]*.*?)\*\*$", line.strip())

        if match and current_title:
            # Save previous section
            video = video_urls[current_video_idx] if current_video_idx < len(video_urls) else None
            sections.append((current_title, "\n".join(current_lines).strip(), video))
            current_video_idx += 1
            current_lines = []

        if match:
            current_title = match.group(1).strip()
        else:
            current_lines.append(line)

    # Save last section
    if current_title:
        video = video_urls[current_video_idx] if current_video_idx < len(video_urls) else None
        sections.append((current_title, "\n".join(current_lines).strip(), video))

    # If no sections found, create one per video
    if not sections:
        for i, url in enumerate(video_urls):
            sections.append((f"第{i+1}講", "", url))

    return sections


# ============================================
# メイン
# ============================================

def main():
    print("🚀 LMSコンテンツ投入スクリプト")
    print(f"  Supabase: {SUPABASE_URL}")
    print(f"  Notion: {NOTION_TOKEN[:15]}...")

    # 新卒カリキュラム
    seed_shinsotsu()

    # 中途ポータル
    seed_kisotsu()

    # 最終カウント
    courses = supabase_request("GET", "courses", params={"select": "id"})
    lessons = supabase_request("GET", "lessons", params={"select": "id"})
    plans = supabase_request("GET", "plans", params={"select": "id"})

    print(f"\n{'='*50}")
    print(f"🎉 投入完了!")
    print(f"  コース: {len(courses or [])}")
    print(f"  レッスン: {len(lessons or [])}")
    print(f"  プラン: {len(plans or [])}")
    print(f"{'='*50}")


if __name__ == "__main__":
    # Force unbuffered output
    sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
    main()
