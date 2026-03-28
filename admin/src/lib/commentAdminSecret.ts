/** Đồng bộ với `functions/api/comment/_shared.ts` — chuẩn hóa trước khi gửi header. */
export function normalizeCommentsAdminSecret(input: string): string {
  return String(input ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFC')
    .trim();
}
