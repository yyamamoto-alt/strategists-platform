/**
 * CRM用 シンプルなin-memoryレート制限
 *
 * Vercel Serverless では invocation 間で Map が共有されない場合があるが、
 * 同一 invocation 内での連続呼び出し（ブルートフォース等）には有効。
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// 古いエントリの定期クリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key);
  }
}, 60_000);

export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  entry.count += 1;

  if (entry.count > limit) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: limit - entry.count };
}
