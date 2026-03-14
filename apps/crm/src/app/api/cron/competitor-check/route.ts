import { createServiceClient } from "@/lib/supabase/server";
import { isSystemAutomationEnabled } from "@/lib/slack";
import { notifyCompetitorChange } from "@/lib/slack";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * HTMLからテキストを抽出（簡易版）
 * scriptタグ、styleタグ、HTMLタグを除去し、テキストのみ返す
 */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 50000); // 50KB制限
}

/**
 * Claude APIで変更内容を要約
 */
async function summarizeChanges(
  siteName: string,
  oldText: string,
  newText: string
): Promise<{ summary: string; changeType: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { summary: "ページ内容に変更が検出されました（AI要約なし）", changeType: "content_change" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `あなたは競合分析アシスタントです。以下は「${siteName}」のウェブサイトの変更前後のテキストです。

【変更前（抜粋）】
${oldText.substring(0, 5000)}

【変更後（抜粋）】
${newText.substring(0, 5000)}

以下のJSON形式で回答してください:
{
  "summary": "変更内容の日本語要約（2-3文）",
  "changeType": "content_change | price_change | new_service | design_change | minor_update"
}

料金変更、新サービス追加、大幅なリニューアルなど、ビジネス上重要な変更を優先的に報告してください。`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { summary: "ページ内容に変更が検出されました", changeType: "content_change" };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || "変更が検出されました",
        changeType: parsed.changeType || "content_change",
      };
    }
    return { summary: text.substring(0, 300), changeType: "content_change" };
  } catch {
    return { summary: "ページ内容に変更が検出されました", changeType: "content_change" };
  }
}

/**
 * GET /api/cron/competitor-check
 * 競合サイトの変更を定期チェック
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("competitor-check"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // アクティブなサイトを取得
  const { data: sites } = await db
    .from("competitor_sites")
    .select("*")
    .eq("is_active", true);

  if (!sites || sites.length === 0) {
    return NextResponse.json({ ok: true, message: "No active sites to check" });
  }

  const results: { site: string; status: string; changed: boolean }[] = [];

  for (const site of sites) {
    try {
      // ページ取得
      const res = await fetch(site.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StrategistsCRM/1.0; competitor-monitor)",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        results.push({ site: site.name, status: `HTTP ${res.status}`, changed: false });
        continue;
      }

      const html = await res.text();
      const contentText = extractText(html);
      const contentHash = crypto.createHash("sha256").update(contentText).digest("hex");

      // 前回のスナップショットを取得
      const { data: lastSnapshot } = await db
        .from("competitor_snapshots")
        .select("*")
        .eq("site_id", site.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .single();

      // スナップショット保存
      const { data: newSnapshot } = await db
        .from("competitor_snapshots")
        .insert({
          site_id: site.id,
          content_hash: contentHash,
          content_text: contentText.substring(0, 100000),
        })
        .select()
        .single();

      // last_checked_at 更新
      await db
        .from("competitor_sites")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", site.id);

      // 変更検知
      if (lastSnapshot && lastSnapshot.content_hash !== contentHash) {
        const { summary, changeType } = await summarizeChanges(
          site.name,
          lastSnapshot.content_text || "",
          contentText
        );

        // アラート作成
        await db.from("competitor_alerts").insert({
          site_id: site.id,
          snapshot_id: newSnapshot?.id || null,
          change_type: changeType,
          change_summary: summary,
          details: {
            old_hash: lastSnapshot.content_hash,
            new_hash: contentHash,
            url: site.url,
          },
        });

        // Slack通知
        await notifyCompetitorChange({
          siteName: site.name,
          url: site.url,
          changeType,
          summary,
        });

        results.push({ site: site.name, status: "changed", changed: true });
      } else {
        results.push({ site: site.name, status: lastSnapshot ? "no_change" : "initial_snapshot", changed: false });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ site: site.name, status: `error: ${msg}`, changed: false });
    }
  }

  // 古いスナップショットを削除（各サイト最新30件のみ保持）
  for (const site of sites) {
    const { data: oldSnapshots } = await db
      .from("competitor_snapshots")
      .select("id")
      .eq("site_id", site.id)
      .order("fetched_at", { ascending: false })
      .range(30, 1000);

    if (oldSnapshots && oldSnapshots.length > 0) {
      const ids = oldSnapshots.map((s: { id: string }) => s.id);
      await db.from("competitor_snapshots").delete().in("id", ids);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    results,
    timestamp: new Date().toISOString(),
  });
}
