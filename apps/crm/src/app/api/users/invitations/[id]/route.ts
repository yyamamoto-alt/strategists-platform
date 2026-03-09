import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", id) as { error: unknown };

  if (error) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
