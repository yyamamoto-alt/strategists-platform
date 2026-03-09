import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.EMAIL_FROM || "Strategists <noreply@akagiconsulting.com>";

interface InviteEmailParams {
  to: string;
  displayName: string | null;
  role: string;
  inviteUrl: string;
  appName: string;
  mentorName?: string;
  mentorLineUrl?: string;
  mentorBookingUrl?: string;
  mentorProfileText?: string;
}

function roleLabel(role: string): string {
  switch (role) {
    case "admin": return "管理者";
    case "mentor": return "メンター";
    case "student": return "受講生";
    default: return role;
  }
}

export async function sendInviteEmail({ to, displayName, role, inviteUrl, appName, mentorName, mentorLineUrl, mentorBookingUrl, mentorProfileText }: InviteEmailParams) {
  if (!resend) {
    throw new Error("RESEND_API_KEY が設定されていません");
  }

  const greeting = displayName ? `${displayName} 様` : "ご担当者 様";

  let mentorContactLines = "";
  if (mentorLineUrl) mentorContactLines += `<p style="font-size: 13px; margin: 8px 0 0 0;"><a href="${mentorLineUrl}" style="display: inline-block; padding: 8px 16px; background-color: #06C755; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px;">LINEで友達追加する</a></p>`;
  if (mentorBookingUrl) mentorContactLines += `<p style="font-size: 13px; margin: 8px 0 0 0;"><a href="${mentorBookingUrl}" style="display: inline-block; padding: 8px 16px; background-color: #C13028; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px;">初回面談を予約する</a></p>`;
  if (mentorProfileText) mentorContactLines += `<p style="font-size: 13px; color: #666; margin: 8px 0 0 0; line-height: 1.5;">${mentorProfileText}</p>`;

  const mentorSection = mentorName ? `
        <div style="background-color: #f8f8f8; border-left: 4px solid #C13028; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <p style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 8px 0;">担当メンターのご紹介</p>
          <p style="font-size: 15px; color: #333; margin: 0 0 4px 0;">担当メンター: <strong>${mentorName}</strong></p>
          ${mentorContactLines}
          ${!mentorLineUrl ? '<p style="font-size: 13px; color: #666; margin: 8px 0 0 0;">ご質問は support@akagiconsulting.com までお気軽にお問い合わせください。</p>' : ""}
        </div>
  ` : "";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `【Strategists ${appName}】招待のご案内`,
    html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #C13028; margin: 0;">Strategists ${appName}</h1>
        </div>
        <p style="font-size: 16px; line-height: 1.6;">${greeting}</p>
        <p style="font-size: 16px; line-height: 1.6;">
          Strategists ${appName}に${roleLabel(role)}として招待されました。<br>
          以下のリンクからアカウントを作成してください。
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C13028; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
            アカウントを作成する
          </a>
        </div>
        ${mentorSection}
        <p style="font-size: 13px; color: #888; line-height: 1.6;">
          このリンクの有効期限は発行から30日間です。<br>
          もしリンクが機能しない場合は、以下のURLをブラウザに直接貼り付けてください：
        </p>
        <p style="font-size: 12px; color: #888; word-break: break-all;">${inviteUrl}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="font-size: 12px; color: #aaa; text-align: center;">
          &copy; Strategists by Akagi Consulting
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`メール送信に失敗しました: ${error.message}`);
  }
}
