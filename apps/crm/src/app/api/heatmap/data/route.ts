import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const pagePath = sp.get("page_path") || "/";
  const device = sp.get("device") || "pc";
  const days = Math.min(parseInt(sp.get("days") || "30", 10), 90);
  const type = sp.get("type") || "clicks"; // "clicks" | "scroll" | "versions"
  const version = sp.get("version"); // optional: filter by lp_version

  const supabase: SB = createServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  // バージョン一覧取得
  if (type === "versions") {
    const { data, error } = await supabase
      .from("heatmap_events")
      .select("lp_version, created_at")
      .eq("page_path", pagePath)
      .gte("created_at", sinceStr)
      .order("created_at", { ascending: false }) as { data: { lp_version: string; created_at: string }[] | null; error: { message: string } | null };

    if (error) return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });

    // バージョンごとに最初と最後の日時、件数を集計
    const vMap = new Map<string, { count: number; first: string; last: string }>();
    for (const row of data || []) {
      const v = row.lp_version;
      const cur = vMap.get(v);
      if (!cur) {
        vMap.set(v, { count: 1, first: row.created_at, last: row.created_at });
      } else {
        cur.count++;
        if (row.created_at < cur.first) cur.first = row.created_at;
        if (row.created_at > cur.last) cur.last = row.created_at;
      }
    }
    const versions = [...vMap.entries()].map(([v, info]) => ({
      version: v, ...info,
    })).sort((a, b) => b.last.localeCompare(a.last));

    return NextResponse.json({ versions });
  }

  // 共通クエリビルダー
  function baseQuery(select: string) {
    let q = supabase
      .from("heatmap_events")
      .select(select)
      .eq("page_path", pagePath)
      .eq("device_type", device)
      .gte("created_at", sinceStr);
    if (version) q = q.eq("lp_version", version);
    return q;
  }

  if (type === "scroll") {
    const { data, error } = await baseQuery("session_id, scroll_depth")
      .eq("event_type", "scroll") as { data: { session_id: string; scroll_depth: number | null }[] | null; error: { message: string } | null };

    if (error) return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });

    const sessionMax = new Map<string, number>();
    for (const row of data || []) {
      const cur = sessionMax.get(row.session_id) || 0;
      if ((row.scroll_depth ?? 0) > cur) sessionMax.set(row.session_id, row.scroll_depth ?? 0);
    }

    const totalSessions = sessionMax.size;
    const depths: { depth: number; sessions: number; rate: number }[] = [];
    for (let d = 0; d <= 100; d += 5) {
      const count = [...sessionMax.values()].filter(v => v >= d).length;
      depths.push({ depth: d, sessions: count, rate: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0 });
    }

    return NextResponse.json({ depths, totalSessions });
  }

  // clicks
  const { data, error } = await baseQuery("x_pct, y_pct")
    .eq("event_type", "click") as { data: { x_pct: number | null; y_pct: number | null }[] | null; error: { message: string } | null };

  if (error) return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });

  const grid = new Map<string, number>();
  let maxCount = 0;
  for (const row of data || []) {
    if (row.x_pct == null || row.y_pct == null) continue;
    const gx = Math.floor(row.x_pct / 2) * 2;
    const gy = Math.floor(row.y_pct / 2) * 2;
    const key = `${gx},${gy}`;
    const count = (grid.get(key) || 0) + 1;
    grid.set(key, count);
    if (count > maxCount) maxCount = count;
  }

  const clicks = [...grid.entries()].map(([key, count]) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y, count };
  });

  return NextResponse.json({ clicks, total: data?.length || 0, maxCount });
}
