#!/usr/bin/env python3
"""
レッスンコンテンツ内の外部画像をダウンロードしてpublicディレクトリに保存し、
レッスンのHTMLコンテンツ内のURLをローカルパスに書き換える
"""

import json
import os
import re
import requests
import hashlib
import time

SUPABASE_URL = "https://api.supabase.com/v1/projects/plrmqgcigzjuiovsbggf/database/query"
SUPABASE_TOKEN = os.environ.get("SUPABASE_TOKEN", "sbp_fb45349183bb4a9b36f73489b95386d9a60ddd4a")
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "apps", "lms", "public", "content-images")

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


def download_image(url, save_path):
    """画像をダウンロードして保存"""
    try:
        resp = requests.get(url, timeout=30, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        if resp.status_code == 200:
            with open(save_path, "wb") as f:
                f.write(resp.content)
            return True
        else:
            print(f"    HTTP {resp.status_code} for {url[:80]}")
            return False
    except Exception as e:
        print(f"    Error: {e}")
        return False


def url_to_filename(url):
    """URLからユニークなファイル名を生成"""
    # URLのハッシュ + 元のファイル拡張子
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]

    # 拡張子を推定
    path = url.split("?")[0]
    ext = os.path.splitext(path)[1]
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        ext = ".png"

    return f"{url_hash}{ext}"


def main():
    print("=" * 60)
    print("📷 レッスン画像ダウンロード & URL書き換え")
    print("=" * 60)

    # publicディレクトリ作成
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    print(f"保存先: {PUBLIC_DIR}")

    # 画像を含むレッスンを取得
    lessons = supabase_query("""
        SELECT l.id, l.title, l.markdown_content
        FROM lessons l
        WHERE l.markdown_content LIKE '%<img%'
        AND l.content_format = 'html'
    """)

    if not lessons:
        print("画像を含むレッスンが見つかりません")
        return

    print(f"\n{len(lessons)} レッスンに画像あり\n")

    total_downloaded = 0
    total_replaced = 0

    for lesson in lessons:
        lesson_id = lesson["id"]
        title = lesson["title"]
        content = lesson["markdown_content"]

        # src属性の画像URLを全て抽出
        img_urls = re.findall(r'src="(https://[^"]+)"', content)
        if not img_urls:
            continue

        # 重複排除
        unique_urls = list(dict.fromkeys(img_urls))
        print(f"📖 {title} ({len(unique_urls)} images)")

        url_map = {}
        for url in unique_urls:
            filename = url_to_filename(url)
            save_path = os.path.join(PUBLIC_DIR, filename)
            local_url = f"/content-images/{filename}"

            # 既にダウンロード済みならスキップ
            if os.path.exists(save_path):
                url_map[url] = local_url
                continue

            # ダウンロード
            if download_image(url, save_path):
                url_map[url] = local_url
                total_downloaded += 1
                print(f"  ✅ {filename}")
            else:
                print(f"  ❌ {url[:60]}...")

            time.sleep(0.1)

        # コンテンツ内のURLを置換
        updated_content = content
        for old_url, new_url in url_map.items():
            updated_content = updated_content.replace(old_url, new_url)

        if updated_content != content:
            # DBを更新
            escaped = updated_content.replace("'", "''")
            sql = f"UPDATE lessons SET markdown_content = '{escaped}', updated_at = now() WHERE id = '{lesson_id}'"
            result = supabase_query(sql)
            if result is not None:
                total_replaced += 1
                print(f"  📝 DB updated ({len(url_map)} URLs replaced)")
            else:
                print(f"  ❌ DB update failed")

    print(f"\n{'=' * 60}")
    print(f"✅ 完了: {total_downloaded} 画像ダウンロード, {total_replaced} レッスン更新")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
