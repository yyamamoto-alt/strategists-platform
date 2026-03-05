#!/usr/bin/env python3
"""残りのmarkdownレッスンをHTML形式に変換"""

import json
import re
import requests

SUPABASE_URL = "https://api.supabase.com/v1/projects/plrmqgcigzjuiovsbggf/database/query"
SUPABASE_TOKEN = "sbp_fb45349183bb4a9b36f73489b95386d9a60ddd4a"

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


def markdown_to_html(md):
    """簡易マークダウン→HTML変換"""
    if not md or not md.strip():
        return ""

    lines = md.strip().split("\n")
    result = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if in_list:
                result.append("</ul>")
                in_list = False
            result.append("")
            continue

        # List items
        if stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                result.append("<ul>")
                in_list = True
            item = stripped[2:]
            item = apply_inline(item)
            result.append(f"<li>{item}</li>")
            continue

        if in_list:
            result.append("</ul>")
            in_list = False

        # Headers
        if stripped.startswith("### "):
            result.append(f"<h3>{apply_inline(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            result.append(f"<h2>{apply_inline(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            result.append(f"<h1>{apply_inline(stripped[2:])}</h1>")
        else:
            result.append(f"<p>{apply_inline(stripped)}</p>")

    if in_list:
        result.append("</ul>")

    return "\n".join(result)


def apply_inline(text):
    """インラインマークダウン変換"""
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', text)
    return text


def main():
    print("=" * 60)
    print("📝 残りのmarkdownレッスンをHTMLに変換")
    print("=" * 60)

    lessons = supabase_query(
        "SELECT id, title, markdown_content FROM lessons WHERE content_format = 'markdown' OR content_format IS NULL ORDER BY title"
    )

    if not lessons:
        print("変換対象のレッスンがありません")
        return

    print(f"\n{len(lessons)} レッスンが対象\n")

    updated = 0
    for lesson in lessons:
        lid = lesson["id"]
        title = lesson["title"]
        content = lesson.get("markdown_content") or ""

        print(f"  {title} ({len(content)} chars)...", end="", flush=True)

        if not content.strip():
            # 空コンテンツでもformat更新
            supabase_query(f"UPDATE lessons SET content_format = 'html', updated_at = now() WHERE id = '{lid}'")
            print(" (empty, format updated)")
            updated += 1
            continue

        html = markdown_to_html(content)
        escaped = html.replace("'", "''")
        sql = f"UPDATE lessons SET markdown_content = '{escaped}', content_format = 'html', updated_at = now() WHERE id = '{lid}'"
        result = supabase_query(sql)

        if result is not None:
            print(f" ✅ ({len(html)} chars)")
            updated += 1
        else:
            print(" ❌")

    print(f"\n{'=' * 60}")
    print(f"✅ 完了: {updated}/{len(lessons)} レッスン変換")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
