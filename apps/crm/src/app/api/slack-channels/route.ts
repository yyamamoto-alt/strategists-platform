import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "SLACK_BOT_TOKEN未設定" }, { status: 500 });
  }

  try {
    const channels: { id: string; name: string }[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (!data.ok) {
        return NextResponse.json({ error: `Slack API: ${data.error}` }, { status: 500 });
      }

      for (const ch of data.channels || []) {
        channels.push({ id: ch.id, name: ch.name });
      }

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    channels.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(channels, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Slack channels fetch error:", err);
    return NextResponse.json({ error: "Slackチャンネルの取得に失敗しました" }, { status: 500 });
  }
}
