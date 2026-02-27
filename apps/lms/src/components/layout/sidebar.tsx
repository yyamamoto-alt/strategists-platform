"use client";

import Link from "next/link";
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
  { name: "コース", href: "/courses", icon: "📚" },
  { name: "課題", href: "/assignments-lms", icon: "📝" },
  { name: "プログレスシート", href: "/progress-sheets", icon: "📋" },
  { name: "スケジュール", href: "/schedule", icon: "📅" },
  { name: "お知らせ", href: "/announcements", icon: "🔔" },
];

const adminNavigation: NavItem[] = [
  { name: "受講生管理", href: "/students", icon: "🎓", roles: ["admin", "mentor"] },
  { name: "入塾申請", href: "/applications", icon: "📨", roles: ["admin", "mentor"] },
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
        const isActive =
          pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-primary-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
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
  const { user, role, signOut } = useAuth();

  const roleLabel = role === "admin" ? "管理者" : role === "mentor" ? "メンター" : "受講生";
  const roleInitial = role === "admin" ? "管" : role === "mentor" ? "メ" : "生";

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-bold">Strategists LMS</h1>
        <p className="text-xs text-gray-400 mt-1">学習管理システム</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <NavSection title="学習" items={learningNavigation} role={role} />
        <NavSection title="管理" items={adminNavigation} role={role} />
        <NavSection title="設定" items={settingsNavigation} role={role} />
      </nav>
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-sm font-bold">
            {roleInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{roleLabel}</p>
            <p className="text-xs text-gray-400 truncate">
              {user?.email || "guest@example.com"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
