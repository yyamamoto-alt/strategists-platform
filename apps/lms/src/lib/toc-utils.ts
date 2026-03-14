/**
 * Table of Contents ユーティリティ
 * HTML/Markdown コンテンツから H2/H3 見出しを抽出し、目次データを生成する
 */

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * テキストからスラッグを生成する
 * 日本語テキストの場合はインデックスベースのIDを使用
 */
export function slugify(text: string, index: number): string {
  // ASCII文字のみの場合はテキストベースのスラッグを生成
  const ascii = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  if (ascii.length > 0 && /[a-z0-9]/.test(ascii)) {
    return `section-${ascii}`;
  }

  // 日本語やその他の非ASCII文字が含まれる場合はインデックスベースのIDを使用
  return `section-${index}`;
}

/**
 * HTML文字列から H2/H3 見出しを抽出して TocItem 配列を返す
 */
export function extractTocFromHtml(html: string): TocItem[] {
  const items: TocItem[] = [];
  // <h2> と <h3> タグにマッチする正規表現
  const headingRegex = /<h([23])(?:\s[^>]*)?>(.+?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10) as 2 | 3;
    // HTMLタグを除去してテキストのみ取得
    const text = match[2].replace(/<[^>]*>/g, "").trim();

    if (text.length === 0) continue;

    const id = slugify(text, index);
    items.push({ id, text, level });
    index++;
  }

  return items;
}

/**
 * Markdownテキストから H2/H3 見出しを抽出して TocItem 配列を返す
 */
export function extractTocFromMarkdown(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split("\n");
  let index = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // ## または ### で始まる行を検出 (#### 以降は無視)
    const match = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length as 2 | 3;
    // Markdown装飾を除去
    const text = match[2]
      .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
      .replace(/\*(.+?)\*/g, "$1")      // italic
      .replace(/`(.+?)`/g, "$1")        // inline code
      .replace(/\[(.+?)\]\(.*?\)/g, "$1") // links
      .trim();

    if (text.length === 0) continue;

    const id = slugify(text, index);
    items.push({ id, text, level });
    index++;
  }

  return items;
}
