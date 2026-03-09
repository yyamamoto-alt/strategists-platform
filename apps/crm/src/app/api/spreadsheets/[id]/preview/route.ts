import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchColumnDataStatus, getSheetMetadata } from "@/lib/google-sheets";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: connection, error } = await db
    .from("spreadsheet_connections")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const [columnStatus, sheets] = await Promise.all([
      fetchColumnDataStatus(connection.spreadsheet_id, connection.sheet_name, 10),
      getSheetMetadata(connection.spreadsheet_id),
    ]);

    return NextResponse.json({
      headers: columnStatus.headers,
      activeColumns: columnStatus.activeColumns,
      sheets: sheets.map((s: { title: string }) => s.title),
      currentSheet: connection.sheet_name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
