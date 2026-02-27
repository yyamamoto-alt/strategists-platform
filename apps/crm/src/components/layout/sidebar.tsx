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

const mainNavigation: NavItem[] = [
  { name: "ダッシュボード", href: "/dashboard", icon: "📊" },
  { name: "顧客一覧", href: "/customers", icon: "👤", roles: ["admin", "mentor"] },
  { name: "パイプライン", href: "/pipeline", icon: "🔄", roles: ["admin", "mentor"] },
  { name: "売上管理", href: "/revenue", icon: "💰", roles: ["admin"] },
];

const adminNavigation: NavItem[] = [
  { name: "学習管理", href: "/learning", icon: "📖", roles: ["admin", "mentor"] },
  { name: "エージェント", href: "/agents", icon: "🤝", roles: ["admin", "mentor"] },
];

function NavSection({ title, items, role }: { title: string; items: NavItem[]; role: string | null }) {
  const pathname = usePathname();
  const filteredItems = items.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

  if (filteredItems.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {title}
      </p>
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
  const { user, role, signOut } = useAuth();

  const roleLabel = role === "admin" ? "管理者" : role === "mentor" ? "メンター" : "受講生";
  const roleInitial = role === "admin" ? "管" : role === "mentor" ? "メ" : "生";

  return (
    <aside className="w-64 bg-surface-raised text-white flex flex-col shrink-0 border-r border-white/10">
      <div className="p-6 border-b border-white/10">
        <Image
          src="/strategists-logo.png"
          alt="Strategists"
          width={180}
          height={48}
          className="h-10 w-auto object-contain"
          priority
        />
        <p className="text-xs text-gray-400 mt-2">経営管理システム</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <NavSection title="メイン" items={mainNavigation} role={role} />
        <NavSection title="管理" items={adminNavigation} role={role} />
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-sm font-bold">
            {roleInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{roleLabel}</p>
            <p className="text-xs text-gray-400 truncate">
              {user?.email || "admin@example.com"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
