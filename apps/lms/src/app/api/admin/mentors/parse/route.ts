import { getLmsSession } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "テキストが空です" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `以下のテキストにはメンター（指導者）の情報が含まれています。各メンターについて以下の情報を抽出してJSON配列で返してください。

抽出する項目:
- name: ニックネーム/名前
- line_url: LINE友達追加URL (https://line.me/... 形式)
- booking_url: 面談予約URL (calendly, timerex等のURL)
- profile_text: 自己紹介文やプロフィール（簡潔にまとめて）

見つからない項目はnullにしてください。
JSON配列のみを返してください。他のテキストは不要です。

---
${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Anthropic API error:", res.status, errBody);
      return NextResponse.json(
        { error: `AI解析に失敗しました (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || "";

    // Extract JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AIの応答からメンター情報を抽出できませんでした", raw: content },
        { status: 422 }
      );
    }

    const mentors = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ mentors });
  } catch (err) {
    console.error("Parse error:", err);
    return NextResponse.json(
      { error: "解析中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
