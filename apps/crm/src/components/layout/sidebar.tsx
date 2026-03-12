"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  name: string;
  href: string;
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    title: "",
    items: [
      { name: "ダッシュボード", href: "/dashboard" },
      { name: "KPI", href: "/revenue", roles: ["admin"] },
      { name: "顧客DB", href: "/customers", roles: ["admin", "member", "mentor"] },
      { name: "パイプライン", href: "/pipeline", roles: ["admin", "member", "mentor"] },
      { name: "マーケティング分析", href: "/analytics", roles: ["admin"] },
    ],
  },
  {
    title: "システム",
    items: [
      { name: "フォームDB", href: "/form-data", roles: ["admin", "member", "mentor"] },
      { name: "注文管理", href: "/orders", roles: ["admin"] },
      { name: "その他売上", href: "/other-revenues", roles: ["admin"] },
      { name: "補助金", href: "/subsidy", roles: ["admin"] },
      { name: "ユーザー管理", href: "/users", roles: ["admin"] },
      { name: "データ連携", href: "/data-sync", roles: ["admin"] },
      { name: "自動連携 (旧Zapier)", href: "/automations", roles: ["admin"] },
      { name: "設定", href: "/settings", roles: ["admin"] },
    ],
    collapsible: true,
    defaultOpen: false,
  },
];

function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

function NavGroupSection({ group, role }: { group: NavGroup; role: string | null }) {
  const pathname = usePathname();
  const filteredItems = group.items.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

  // セクション内のページがアクティブかどうか
  const hasActiveItem = filteredItems.some((item) => isItemActive(pathname, item.href));

  const [isOpen, setIsOpen] = useState(
    group.defaultOpen !== undefined ? group.defaultOpen || hasActiveItem : true
  );

  if (filteredItems.length === 0) return null;

  return (
    <div className="mb-2">
      {group.collapsible ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 mb-1 group"
        >
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider group-hover:text-gray-400 transition-colors">
            {group.title}
          </span>
          <svg
            className={cn(
              "w-3 h-3 text-gray-600 transition-transform",
              isOpen && "rotate-180"
            )}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : group.title ? (
        <p className="px-3 mb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          {group.title}
        </p>
      ) : null}
      {(isOpen || !group.collapsible) && filteredItems.map((item) => {
        const isActive = isItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-brand-muted text-white"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <span>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (q) {
        router.push(`/customers?search=${encodeURIComponent(q)}`);
      }
    },
    [query, router]
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="顧客を検索..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
        />
      </div>
    </form>
  );
}

export function Sidebar() {
  const { user, role, signOut } = useAuth();

  const roleLabel = role === "admin" ? "管理者" : (role === "member" || role === "mentor") ? "一般" : "受講生";
  const roleInitial = role === "admin" ? "管" : (role === "member" || role === "mentor") ? "般" : "生";

  return (
    <aside className="w-56 bg-surface-raised text-white flex flex-col shrink-0 border-r border-white/10">
      <div className="p-5 border-b border-white/10">
        <Image
          src="/strategists-logo.png"
          alt="Strategists"
          width={180}
          height={48}
          className="h-9 w-auto object-contain"
          priority
        />
        <div className="flex items-center gap-2 mt-1.5">
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded">CRM</span>
          <p className="text-[10px] text-gray-400">経営管理システム</p>
        </div>
      </div>
      <div className="px-3 pt-3 pb-1">
        <SearchBox />
      </div>
      <nav className="flex-1 px-3 pt-3 space-y-0 overflow-y-auto">
        {navGroups.map((group) => (
          <NavGroupSection key={group.title} group={group} role={role} />
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-7 h-7 bg-brand rounded-full flex items-center justify-center text-xs font-bold">
            {roleInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{roleLabel}</p>
            <p className="text-[10px] text-gray-400 truncate">
              {user?.email || ""}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full mt-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
        >
          ログアウト
        </button>
        {process.env.NEXT_PUBLIC_BUILD_TIME && (
          <p className="px-2 mt-1 text-[10px] text-gray-600">
            Deploy: {new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
          </p>
        )}
      </div>
    </aside>
  );
}
