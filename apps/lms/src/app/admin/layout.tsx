import { getLmsSession } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminLayoutClient } from "./admin-layout-client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (!useMock) {
    const session = await getLmsSession();
    if (!session || (session.role !== "admin" && session.role !== "mentor")) {
      redirect("/courses");
    }
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
