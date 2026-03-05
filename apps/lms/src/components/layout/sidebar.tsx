"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  name: string;
  href: string;
  icon: string;
  roles?: string[];
}

const learningNavigation: NavItem[] = [
  { name: "マイページ", href: "/mypage", icon: "👤" },
  { name: "コース", href: "/courses", icon: "📚" },
  { name: "課題", href: "/assignments-lms", icon: "📝" },
  { name: "プログレスシート", href: "/progress-sheets", icon: "📋" },
  { name: "お知らせ", href: "/announcements", icon: "🔔" },
];

const adminNavigation: NavItem[] = [
  { name: "教材管理", href: "/admin/contents", icon: "📖", roles: ["admin"] },
  { name: "コース管理", href: "/admin/courses", icon: "📚", roles: ["admin"] },
  { name: "フォーム管理", href: "/admin/forms", icon: "📝", roles: ["admin"] },
  { name: "ユーザー管理", href: "/admin/students", icon: "🎓", roles: ["admin", "mentor"] },
];

const settingsNavigation: NavItem[] = [
  { name: "設定", href: "/settings", icon: "⚙️" },
];

function NavSection({ title, items, role }: { title: string; items: NavItem[]; role: string | null }) {
  const pathname = usePathname();
  const filteredItems = items.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

  if (filteredItems.length === 0) return null;

  return (
    <div className="mb-4">
      {title && (
        <p className="px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </p>
      )}
      {filteredItems.map((item) => {
        // /courses と /courses/manage の重複防止
        const isActive =
          pathname === item.href ||
          (pathname?.startsWith(item.href + "/") &&
            // /courses/manage は /courses の子として誤判定しない
            !(item.href === "/courses" && pathname?.startsWith("/courses/manage")));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-brand-muted text-white"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { user, role, displayName, signOut } = useAuth();

  const roleLabel = role === "admin" ? "管理者" : role === "mentor" ? "メンター" : "受講生";
  const nameDisplay = displayName || user?.email?.split("@")[0] || "ゲスト";
  const nameInitial = displayName ? displayName.charAt(0) : (user?.email?.charAt(0)?.toUpperCase() || "?");

  return (
    <aside className="w-64 bg-surface-raised-lms text-white flex flex-col shrink-0 border-r border-red-900/30">
      <div className="p-6 border-b border-white/10">
        <Image
          src="/strategists-logo.png"
          alt="Strategists"
          width={180}
          height={48}
          className="h-10 w-auto object-contain"
          priority
        />
        <div className="flex items-center gap-2 mt-2">
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-700 text-white rounded">LMS</span>
          <p className="text-xs text-gray-400">学習管理システム</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <NavSection title="学習" items={learningNavigation} role={role} />
        <NavSection title="管理" items={adminNavigation} role={role} />
        <NavSection title="設定" items={settingsNavigation} role={role} />
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center text-sm font-bold shrink-0">
            {nameInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{nameDisplay}</p>
            <p className="text-xs text-gray-500 truncate">{roleLabel}</p>
          </div>
        </div>
        {process.env.NEXT_PUBLIC_BUILD_TIME && (
          <p className="px-3 mt-2 text-[10px] text-gray-600">
            Deploy: {new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
          </p>
        )}
      </div>
    </aside>
  );
}
