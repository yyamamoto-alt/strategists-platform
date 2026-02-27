import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return NextResponse.next();
  }

  // In production mode, implement Supabase auth check here
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
