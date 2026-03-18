import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/agent-desk
 * Agent Desk（採用管理）からAI内定可能性を受信してagent_recordsを更新
 *
 * Body:
 *   { customer_id: string, ai_offer_probability: number (0-100) }
 *   or
 *   { customer_email: string, ai_offer_probability: number (0-100) }
 *
 * Auth: Authorization: Bearer <AGENT_DESK_WEBHOOK_SECRET>
 */
export async function POST(request: Request) {
  // 認証
  const authHeader = request.headers.get("authorization");
  const secret = process.env.AGENT_DESK_WEBHOOK_SECRET;

  if (!secret) {
    console.error("AGENT_DESK_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customer_id, customer_email, ai_offer_probability } = body as {
    customer_id?: string;
    customer_email?: string;
    ai_offer_probability?: number;
  };

  // バリデーション
  if (ai_offer_probability == null || typeof ai_offer_probability !== "number" || ai_offer_probability < 0 || ai_offer_probability > 100) {
    return NextResponse.json({ error: "ai_offer_probability must be a number between 0 and 100" }, { status: 400 });
  }

  if (!customer_id && !customer_email) {
    return NextResponse.json({ error: "Either customer_id or customer_email is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  // customer_id を特定
  let resolvedCustomerId = customer_id;

  if (!resolvedCustomerId && customer_email) {
    // メールアドレスからcustomer_idを検索（customers + customer_emails）
    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("email", customer_email)
      .maybeSingle();

    if (customer) {
      resolvedCustomerId = customer.id;
    } else {
      // 副メールアドレスも検索
      const { data: altEmail } = await db
        .from("customer_emails")
        .select("customer_id")
        .eq("email", customer_email)
        .maybeSingle();

      if (altEmail) {
        resolvedCustomerId = altEmail.customer_id;
      }
    }

    if (!resolvedCustomerId) {
      return NextResponse.json({ error: `Customer not found for email: ${customer_email}` }, { status: 404 });
    }
  }

  // agent_recordsを更新（なければ作成）
  const { data: existing } = await db
    .from("agent_records")
    .select("id")
    .eq("customer_id", resolvedCustomerId)
    .maybeSingle();

  const probability = Math.round(ai_offer_probability);

  if (existing) {
    const { error } = await db
      .from("agent_records")
      .update({ ai_offer_probability: probability })
      .eq("customer_id", resolvedCustomerId);

    if (error) {
      console.error("Failed to update agent_records:", error);
      return NextResponse.json({ error: "Database update failed" }, { status: 500 });
    }
  } else {
    const { error } = await db
      .from("agent_records")
      .insert({
        customer_id: resolvedCustomerId,
        ai_offer_probability: probability,
        job_search_status: "活動中",
      });

    if (error) {
      console.error("Failed to insert agent_records:", error);
      return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    customer_id: resolvedCustomerId,
    ai_offer_probability: probability,
  });
}
