import { createAdminClient } from "@/lib/supabase/admin";
import { InviteClient } from "./invite-client";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (useMock) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-surface-card border border-white/10 rounded-2xl p-8 text-center text-gray-400">
          モックモードでは招待機能は利用できません
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, display_name, token, expires_at, used_at")
    .eq("token", token)
    .single();

  if (!invitation) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-surface-card border border-white/10 rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">無効なリンク</h1>
          <p className="text-gray-400">この招待リンクは無効です。管理者にお問い合わせください。</p>
        </div>
      </div>
    );
  }

  if (invitation.used_at) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-surface-card border border-white/10 rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">使用済みリンク</h1>
          <p className="text-gray-400">この招待リンクは既に使用されています。</p>
          <a href="/login" className="mt-4 inline-block text-brand hover:text-brand-dark">
            ログインはこちら
          </a>
        </div>
      </div>
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-surface-card border border-white/10 rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">期限切れ</h1>
          <p className="text-gray-400">この招待リンクは有効期限が切れています。管理者に新しいリンクを依頼してください。</p>
        </div>
      </div>
    );
  }

  return (
    <InviteClient
      token={token}
      email={invitation.email}
      displayName={invitation.display_name}
    />
  );
}
