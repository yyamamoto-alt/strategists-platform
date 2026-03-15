import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 一時的なクリーンアップAPI: 孤立したプログレスシートを削除
 * POST /api/admin/cleanup-sheets
 * Body: { secret: "CRON_SECRET", sheetIds: ["..."] }
 *
 * 使い終わったらこのファイルを削除すること
 */

function getDriveAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing GOOGLE_DRIVE_REFRESH_TOKEN or OAuth client credentials");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { secret, sheetIds, mode = "list" } = body;

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Get all active progress_sheet_urls from contracts
    const { data: activeContracts } = await db
      .from("contracts")
      .select("progress_sheet_url")
      .not("progress_sheet_url", "is", null);

    const activeSheetIds = new Set<string>();
    for (const c of activeContracts || []) {
      const url = c.progress_sheet_url || "";
      if (url.includes("/d/")) {
        const sid = url.split("/d/")[1].split("/")[0];
        activeSheetIds.add(sid);
      }
    }

    if (mode === "list-folder") {
      // List all files in the progress sheet folder
      const auth = getDriveAuth();
      const drive = google.drive({ version: "v3", auth });
      const FOLDER_ID = "1yZqhDyDa_ixkQKYxj4-dBelNnfjGbzzF";

      let allFiles: { id: string; name: string; createdTime: string }[] = [];
      let nextPageToken: string | undefined;

      do {
        const res = await drive.files.list({
          q: `'${FOLDER_ID}' in parents and trashed = false`,
          fields: "nextPageToken,files(id,name,createdTime)",
          pageSize: 1000,
          pageToken: nextPageToken,
          orderBy: "createdTime desc",
        });
        allFiles = allFiles.concat((res.data.files || []) as { id: string; name: string; createdTime: string }[]);
        nextPageToken = res.data.nextPageToken || undefined;
      } while (nextPageToken);

      const orphans = allFiles.filter((f) => !activeSheetIds.has(f.id));

      return NextResponse.json({
        totalInFolder: allFiles.length,
        activeInDb: activeSheetIds.size,
        orphans: orphans.length,
        orphanFiles: orphans.map((f) => ({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime,
        })),
      });
    }

    if (mode === "delete") {
      // Delete specified sheet IDs (only if they are NOT in active contracts)
      const idsToDelete = sheetIds as string[];
      if (!idsToDelete || idsToDelete.length === 0) {
        return NextResponse.json({ error: "No sheetIds provided" }, { status: 400 });
      }

      const auth = getDriveAuth();
      const drive = google.drive({ version: "v3", auth });

      const results: { id: string; status: string; error?: string }[] = [];

      for (const sid of idsToDelete) {
        // Safety: skip if this sheet is actively used in DB
        if (activeSheetIds.has(sid)) {
          results.push({ id: sid, status: "skipped", error: "Active in contracts DB" });
          continue;
        }

        try {
          await drive.files.delete({ fileId: sid });
          results.push({ id: sid, status: "deleted" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          results.push({ id: sid, status: "error", error: msg });
        }
      }

      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: "Invalid mode. Use 'list-folder' or 'delete'" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[cleanup-sheets]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
