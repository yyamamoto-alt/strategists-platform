import { NextResponse } from "next/server";
import { getFreeeConfig } from "@/lib/freee";

export const dynamic = "force-dynamic";

export async function GET() {
  const { clientId, redirectUri } = getFreeeConfig();

  const authUrl = new URL("https://accounts.secure.freee.co.jp/public_api/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "select_company");

  return NextResponse.redirect(authUrl.toString());
}
