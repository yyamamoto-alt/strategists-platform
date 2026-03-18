#!/usr/bin/env python3
"""
Notion → Supabase Lessons 変換スクリプト
NotionページのブロックをHTMLに変換し、Supabaseのlessonsテーブルに挿入する
"""

import requests
import json
import re
import time

NOTION_TOKEN = "REDACTED"
SUPABASE_URL = "https://plrmqgcigzjuiovsbggf.supabase.co/rest/v1/"
SUPABASE_KEY = "REDACTED"

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

# 対象コンテンツ: Notionにデータあり
CONTENTS_WITH_NOTION = [
    {
        "title": "推奨学習方法",
        "content_id": "5b3100a5-f05a-4443-8409-06f376fd9240",
        "notion_page_id": "20e42aed-d74b-808a-a1df-ca3b9b92b052",
    },
    {
        "title": "マッキンゼー/論点設計の教科書",
        "content_id": "24aeb671-a201-4459-8155-be8164e21ffd",
        "notion_page_id": "1b942aed-d74b-8094-a20c-c788bd02a921",
    },
    {
        "title": "総コン内定の教科書",
        "content_id": "ee2847c9-072e-4449-8e24-50ea3f01f7f4",
        "notion_page_id": "21d42aed-d74b-80b0-845d-ea45b5322cf5",
    },
    {
        "title": "McK選考におけるよくある質問",
        "content_id": "e10d8ab0-1ef5-4c0f-b7ab-4b2c5d926385",
        "notion_page_id": "1f442aed-d74b-8085-8bad-cf956ea817b9",
    },
    {
        "title": "ファーム別情報",
        "content_id": "4fb9eb8f-f753-43d3-9bb9-a63007a9be7a",
        "notion_page_id": "19442aed-d74b-80af-8618-d9613a754312",
    },
    {
        "title": "マッキンゼーWebテスト対策",
        "content_id": "6c1a4341-58eb-4c5b-a98a-779d97afeed0",
        "notion_page_id": "19442aed-d74b-8012-a35c-c9d42e2d6c34",
    },
    {
        "title": "解いておきたいケース問題リスト",
        "content_id": "e40a5fbd-4daf-41ab-a3ee-6d6cf087f51b",
        "notion_page_id": "19442aed-d74b-80b6-9456-c562dc1eed46",
    },
]

# Notionにデータなし
CONTENTS_WITHOUT_NOTION = [
    {
        "title": "教材アウトプットについて",
        "content_id": "ba927f14-6d4d-4701-a765-1420496581be",
    },
    {
        "title": "Webテスト対策(既卒)",
        "content_id": "5ac78eac-f21e-459d-9a7c-1d07b40b0bde",
    },
    {
        "title": "ビヘイビア面接準備にあたってのチェックポイント",
        "content_id": "bbf4ea66-e58c-4433-83ab-6cfb04658f78",
    },
]


def fetch_blocks(block_id: str) -> list:
    """Notionブロックを再帰的に取得"""
    blocks = []
    url = f"https://api.notion.com/v1/blocks/{block_id}/children"
    has_more = True
    start_cursor = None

    while has_more:
        params = {"page_size": 100}
        if start_cursor:
            params["start_cursor"] = start_cursor

        resp = requests.get(url, headers=NOTION_HEADERS, params=params)
        if resp.status_code != 200:
            print(f"  Error fetching blocks for {block_id}: {resp.status_code} {resp.text[:200]}")
            return blocks

        data = resp.json()
        for block in data.get("results", []):
            # 子ブロックがある場合は再帰取得
            if block.get("has_children", False):
                block["_children"] = fetch_blocks(block["id"])
            blocks.append(block)

        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
        if has_more:
            time.sleep(0.35)  # Rate limit対策

    return blocks


def rich_text_to_html(rich_texts: list) -> str:
    """Notion rich_text配列をHTMLに変換"""
    html = ""
    for rt in rich_texts:
        text = rt.get("plain_text", "")
        # HTMLエスケープ
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        annotations = rt.get("annotations", {})
        href = rt.get("href")

        # アノテーション適用
        if annotations.get("bold"):
            text = f"<strong>{text}</strong>"
        if annotations.get("italic"):
            text = f"<em>{text}</em>"
        if annotations.get("strikethrough"):
            text = f"<s>{text}</s>"
        if annotations.get("underline"):
            text = f"<u>{text}</u>"
        if annotations.get("code"):
            text = f"<code>{text}</code>"

        # リンク
        if href:
            text = f'<a href="{href}">{text}</a>'

        html += text
    return html


def extract_youtube_id(url: str) -> str:
    """YouTubeのURLからvideo IDを抽出"""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ""


def blocks_to_html(blocks: list) -> str:
    """ブロック配列をHTMLに変換"""
    html_parts = []
    i = 0

    while i < len(blocks):
        block = blocks[i]
        block_type = block.get("type", "")

        if block_type == "paragraph":
            text = rich_text_to_html(block["paragraph"].get("rich_text", []))
            if text:
                html_parts.append(f"<p>{text}</p>")
            else:
                html_parts.append("<p></p>")

        elif block_type in ("heading_1", "heading_2", "heading_3"):
            level = block_type[-1]
            text = rich_text_to_html(block[block_type].get("rich_text", []))
            html_parts.append(f"<h{level}>{text}</h{level}>")

        elif block_type == "bulleted_list_item":
            # 連続するbulleted_list_itemをまとめて<ul>で囲む
            items = []
            while i < len(blocks) and blocks[i].get("type") == "bulleted_list_item":
                b = blocks[i]
                text = rich_text_to_html(b["bulleted_list_item"].get("rich_text", []))
                children_html = ""
                if b.get("_children"):
                    children_html = blocks_to_html(b["_children"])
                items.append(f"<li>{text}{children_html}</li>")
                i += 1
            html_parts.append(f"<ul>{''.join(items)}</ul>")
            continue  # iは既にインクリメント済み

        elif block_type == "numbered_list_item":
            items = []
            while i < len(blocks) and blocks[i].get("type") == "numbered_list_item":
                b = blocks[i]
                text = rich_text_to_html(b["numbered_list_item"].get("rich_text", []))
                children_html = ""
                if b.get("_children"):
                    children_html = blocks_to_html(b["_children"])
                items.append(f"<li>{text}{children_html}</li>")
                i += 1
            html_parts.append(f"<ol>{''.join(items)}</ol>")
            continue

        elif block_type == "image":
            image_data = block["image"]
            url = ""
            if image_data.get("type") == "file":
                url = image_data["file"].get("url", "")
            elif image_data.get("type") == "external":
                url = image_data["external"].get("url", "")
            caption = rich_text_to_html(image_data.get("caption", []))
            alt = caption if caption else ""
            html_parts.append(f'<img src="{url}" alt="{alt}" />')

        elif block_type == "video":
            video_data = block["video"]
            url = ""
            if video_data.get("type") == "external":
                url = video_data["external"].get("url", "")
            elif video_data.get("type") == "file":
                url = video_data["file"].get("url", "")

            video_id = extract_youtube_id(url)
            if video_id:
                html_parts.append(
                    f'<div data-youtube-video><iframe src="https://www.youtube.com/embed/{video_id}" '
                    f'frameborder="0" allowfullscreen="true" allow="accelerometer; autoplay; clipboard-write; '
                    f'encrypted-media; gyroscope; picture-in-picture; web-share"></iframe></div>'
                )
            else:
                html_parts.append(f'<p><a href="{url}">動画リンク</a></p>')

        elif block_type == "code":
            code_data = block["code"]
            text = rich_text_to_html(code_data.get("rich_text", []))
            lang = code_data.get("language", "")
            html_parts.append(f'<pre><code class="language-{lang}">{text}</code></pre>')

        elif block_type == "table":
            children = block.get("_children", [])
            rows_html = []
            for row_block in children:
                if row_block.get("type") == "table_row":
                    cells = row_block["table_row"].get("cells", [])
                    cells_html = "".join(
                        f"<td>{rich_text_to_html(cell)}</td>" for cell in cells
                    )
                    rows_html.append(f"<tr>{cells_html}</tr>")
            html_parts.append(f"<table>{''.join(rows_html)}</table>")

        elif block_type == "toggle":
            toggle_data = block["toggle"]
            summary = rich_text_to_html(toggle_data.get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(
                f"<details><summary>{summary}</summary>{children_html}</details>"
            )

        elif block_type == "callout":
            callout_data = block["callout"]
            text = rich_text_to_html(callout_data.get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(f'<div class="callout">{text}{children_html}</div>')

        elif block_type == "divider":
            html_parts.append("<hr />")

        elif block_type == "quote":
            text = rich_text_to_html(block["quote"].get("rich_text", []))
            children_html = ""
            if block.get("_children"):
                children_html = blocks_to_html(block["_children"])
            html_parts.append(f"<blockquote>{text}{children_html}</blockquote>")

        elif block_type == "bookmark":
            url = block["bookmark"].get("url", "")
            caption = rich_text_to_html(block["bookmark"].get("caption", []))
            label = caption if caption else url
            html_parts.append(f'<p><a href="{url}">{label}</a></p>')

        elif block_type == "embed":
            url = block["embed"].get("url", "")
            html_parts.append(f'<p><a href="{url}">{url}</a></p>')

        elif block_type == "column_list":
            # column_listの子はcolumn。各columnの子をそのまま変換
            if block.get("_children"):
                for col in block["_children"]:
                    if col.get("_children"):
                        html_parts.append(blocks_to_html(col["_children"]))

        elif block_type == "to_do":
            todo_data = block["to_do"]
            text = rich_text_to_html(todo_data.get("rich_text", []))
            checked = "checked" if todo_data.get("checked") else ""
            html_parts.append(f'<p><input type="checkbox" {checked} disabled /> {text}</p>')

        elif block_type == "child_page":
            title = block["child_page"].get("title", "")
            html_parts.append(f"<p><strong>{title}</strong></p>")

        elif block_type == "link_preview":
            url = block["link_preview"].get("url", "")
            html_parts.append(f'<p><a href="{url}">{url}</a></p>')

        elif block_type == "synced_block":
            if block.get("_children"):
                html_parts.append(blocks_to_html(block["_children"]))

        elif block_type == "table_of_contents":
            pass  # 目次は省略

        else:
            print(f"    Unknown block type: {block_type}")

        i += 1

    return "\n".join(html_parts)


def insert_lesson(content_id: str, title: str, html_content: str) -> dict:
    """Supabaseにレッスンをinsert"""
    payload = {
        "content_id": content_id,
        "title": title,
        "lesson_type": "テキスト",
        "markdown_content": html_content,
        "content_format": "html",
        "sort_order": 1,
        "is_active": True,
        "copy_protected": True,
    }

    resp = requests.post(
        f"{SUPABASE_URL}lessons",
        headers=SUPABASE_HEADERS,
        json=payload,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data
    else:
        print(f"  ERROR inserting lesson: {resp.status_code} {resp.text[:300]}")
        return {}


def main():
    print("=" * 60)
    print("Notion → Supabase Lessons 変換開始")
    print("=" * 60)

    # 1. Notionにデータがある7件
    for item in CONTENTS_WITH_NOTION:
        print(f"\n--- {item['title']} ---")
        print(f"  Notion Page: {item['notion_page_id']}")

        # ブロック取得
        blocks = fetch_blocks(item["notion_page_id"])
        print(f"  ブロック数: {len(blocks)}")

        if not blocks:
            print("  ブロックが取得できませんでした。スキップ。")
            continue

        # HTML変換
        html = blocks_to_html(blocks)
        print(f"  HTML文字数: {len(html)}")

        # レッスン作成
        result = insert_lesson(item["content_id"], item["title"], html)
        if result:
            print(f"  レッスン作成成功: {result.get('id', 'unknown')}")
        else:
            print("  レッスン作成失敗")

        time.sleep(0.5)

    # 2. Notionにデータがない3件
    print("\n\n--- Notionにデータがない3件 (空レッスン作成) ---")
    for item in CONTENTS_WITHOUT_NOTION:
        print(f"\n--- {item['title']} ---")
        result = insert_lesson(
            item["content_id"],
            item["title"],
            "<p>コンテンツ準備中</p>",
        )
        if result:
            print(f"  レッスン作成成功: {result.get('id', 'unknown')}")
        else:
            print("  レッスン作成失敗")

    print("\n" + "=" * 60)
    print("完了")
    print("=" * 60)


if __name__ == "__main__":
    main()
