/**
 * シンプルなin-memoryレート制限
 *
 * Vercel Serverless では invocation 間で Map が共有されない場合があるが、
 * 同一 invocation 内での連続呼び出し（ブルートフォース等）には有効。
 * 本番スケールでは upstash/ratelimit や Vercel Edge Config への移行を推奨。
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * レート制限チェック
 * @param identifier - 一意の識別子（例: `login:${ip}`）
 * @param limit - ウィンドウ内の最大リクエスト数
 * @param windowMs - ウィンドウの長さ（ミリ秒）
 * @returns success: 制限内か, remaining: 残りリクエスト数
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  // エントリが無い or ウィンドウ期限切れ → リセット
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  // ウィンドウ内
  entry.count += 1;

  if (entry.count > limit) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: limit - entry.count };
}
