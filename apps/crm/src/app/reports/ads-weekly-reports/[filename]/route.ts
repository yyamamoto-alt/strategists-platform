export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize filename
  if (!filename.endsWith(".html") || filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = join(process.cwd(), "public", "reports", "ads-weekly-reports", filename);

  try {
    const html = await readFile(filePath, "utf-8");
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
