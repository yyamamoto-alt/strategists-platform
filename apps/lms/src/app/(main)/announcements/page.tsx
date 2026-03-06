"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { AnnouncementPriority } from "@strategy-school/shared-db";

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  published_at: string | null;
}

const priorityColors: Record<AnnouncementPriority, string> = { low: "border-l-gray-500", normal: "border-l-brand", high: "border-l-orange-500", urgent: "border-l-red-500" };
const priorityBadges: Record<AnnouncementPriority, string> = { low: "bg-gray-700 text-gray-300", normal: "bg-brand-muted text-brand-light", high: "bg-orange-900/50 text-orange-300", urgent: "bg-red-900/50 text-red-300" };
const priorityLabels: Record<AnnouncementPriority, string> = { low: "低", normal: "通常", high: "高", urgent: "緊急" };

function AutoLinkedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function AnnouncementsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const res = await fetch("/api/announcements");
        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data);
        }
      } catch (err) {
        console.error("Failed to fetch announcements:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnnouncements();
  }, []);

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">お知らせ</h1><p className="text-sm text-gray-400 mt-1">重要なお知らせ・連絡事項</p></div>
      {loading ? (
        <div className="text-center py-12 text-gray-500">読み込み中...</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">お知らせはありません</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const isExpanded = expandedId === a.id;
            return (
              <div key={a.id} className={`bg-surface-elevated rounded-xl border-l-4 ${priorityColors[a.priority]} overflow-hidden`}>
                <button onClick={() => setExpandedId(isExpanded ? null : a.id)} className="w-full p-4 text-left flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityBadges[a.priority]}`}>{priorityLabels[a.priority]}</span>
                    <span className="text-white font-medium">{a.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{a.published_at ? new Date(a.published_at).toLocaleDateString("ja-JP") : ""}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {isExpanded && <div className="px-4 pb-4 border-t border-white/10 pt-3"><p className="text-sm text-gray-300 whitespace-pre-wrap"><AutoLinkedText text={a.content} /></p></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
