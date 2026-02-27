import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return NextResponse.next();
  }

  const publicPaths = ["/login", "/register", "/apply"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // In production, add Supabase auth check here
  if (!isPublicPath) {
    // For now, allow all
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
