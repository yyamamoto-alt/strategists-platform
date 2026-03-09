import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * raw_dataから申込日（タイムスタンプ/date）を抽出してISO文字列に変換
 */
function parseApplicationDateFromRawData(rawData: Record<string, unknown> | null): string | null {
  if (!rawData) return null;

  // よくあるキー名を順番にチェック
  const dateKeys = ["タイムスタンプ", "date", "申込日", "application_date"];
  for (const key of dateKeys) {
    const val = rawData[key];
    if (typeof val === "string" && val.trim()) {
      try {
        const parsed = new Date(val);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      } catch {
        // skip
      }
    }
  }
  return null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // action: "link" (既存顧客に紐付け) | "create" (新規作成) | "ignore" (無視)
  const { action, customer_id } = body;

  if (action === "link" && customer_id) {
    // 既存顧客に紐付け
    const { data: record } = await db
      .from("unmatched_records")
      .select("*")
      .eq("id", id)
      .single();

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // メールがあれば customer_emails に追加
    if (record.email) {
      await db
        .from("customer_emails")
        .upsert(
          { customer_id, email: record.email.trim().toLowerCase(), is_primary: false },
          { onConflict: "email" }
        );
    }

    // application_dateが空なら、raw_dataから補完
    const { data: existingCustomer } = await db
      .from("customers")
      .select("application_date")
      .eq("id", customer_id)
      .single();

    if (existingCustomer && !existingCustomer.application_date && record.raw_data) {
      const appDate = parseApplicationDateFromRawData(record.raw_data);
      if (appDate) {
        await db
          .from("customers")
          .update({ application_date: appDate, updated_at: new Date().toISOString() })
          .eq("id", customer_id);
      }
    }

    // Jicooデータの場合、パイプラインを日程確定に更新
    if (record.raw_data?.event === "guest_booked" || record.raw_data?.event === "guest_rescheduled") {
      const obj = record.raw_data?.object;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineUpdate: Record<string, any> = {
        stage: "未実施",
        updated_at: new Date().toISOString(),
      };
      if (obj?.startedAt) {
        pipelineUpdate.meeting_scheduled_date = obj.startedAt;
      }
      await db
        .from("sales_pipeline")
        .update(pipelineUpdate)
        .eq("customer_id", customer_id);
    }

    // application_history に追加
    const isJicoo = record.raw_data?.event && record.raw_data?.object?.contact;
    await db.from("application_history").insert({
      customer_id,
      source: isJicoo ? "Jicoo" : "manual_link",
      raw_data: record.raw_data,
      notes: isJicoo
        ? `Jicoo ${record.raw_data.event}: ${record.name || record.email || "unknown"} (未マッチから紐付け)`
        : "未マッチレコードから手動紐付け",
    });

    // ステータス更新
    const { data, error } = await db
      .from("unmatched_records")
      .update({ status: "resolved", resolved_customer_id: customer_id })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  if (action === "create") {
    // 新規顧客として作成
    const { data: record } = await db
      .from("unmatched_records")
      .select("*")
      .eq("id", id)
      .single();

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // raw_dataから申込日を取得
    const appDate = parseApplicationDateFromRawData(record.raw_data) || new Date().toISOString();

    // 新規顧客作成
    const { data: newCustomer, error: createError } = await db
      .from("customers")
      .insert({
        name: record.name || "未入力",
        email: record.email || null,
        phone: record.phone || null,
        application_date: appDate,
        data_origin: "auto_sync",
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // customer_emails に追加
    if (record.email) {
      await db.from("customer_emails").insert({
        customer_id: newCustomer.id,
        email: record.email.trim().toLowerCase(),
        is_primary: true,
      });
    }

    // sales_pipeline を作成
    await db.from("sales_pipeline").insert({
      customer_id: newCustomer.id,
      stage: "日程未確",
    });

    // application_history に追加
    await db.from("application_history").insert({
      customer_id: newCustomer.id,
      source: "unmatched_create",
      raw_data: record.raw_data,
      notes: "未マッチレコードから新規作成",
    });

    // ステータス更新
    const { data, error } = await db
      .from("unmatched_records")
      .update({ status: "resolved", resolved_customer_id: newCustomer.id })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...data, new_customer_id: newCustomer.id });
  }

  if (action === "ignore") {
    const { data, error } = await db
      .from("unmatched_records")
      .update({ status: "ignored" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
