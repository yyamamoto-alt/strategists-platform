import { createServiceClient } from "@/lib/supabase/server";
import { InviteClient } from "./invite-client";

export const dynamic = "force-dynamic";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = createServiceClient();

  // トークンで招待レコードを検索
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single() as {
      data: {
        id: string;
        email: string;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
        created_at: string;
      } | null;
    };

  // 招待が見つからない
  if (!invitation) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-surface-card border border-white/10 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">!</div>
          <h1 className="text-xl font-bold text-white mb-2">無効な招待リンク</h1>
          <p className="text-sm text-gray-400">
            この招待リンクは無効です。正しいURLを確認してください。
          </p>
        </div>
      </div>
    );
  }

  // 使用済み
  if (invitation.used_at) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-surface-card border border-white/10 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">!</div>
          <h1 className="text-xl font-bold text-white mb-2">使用済みの招待</h1>
          <p className="text-sm text-gray-400">
            この招待リンクは既に使用されています。
          </p>
          <a
            href="/login"
            className="inline-block mt-4 px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
          >
            ログインページへ
          </a>
        </div>
      </div>
    );
  }

  // 期限切れ
  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-surface-card border border-white/10 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">!</div>
          <h1 className="text-xl font-bold text-white mb-2">期限切れの招待</h1>
          <p className="text-sm text-gray-400">
            この招待リンクの有効期限が切れています。管理者に新しい招待を依頼してください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <InviteClient
      token={token}
      email={invitation.email}
      displayName={invitation.display_name}
      role={invitation.role}
    />
  );
}
