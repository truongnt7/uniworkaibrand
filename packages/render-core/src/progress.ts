import type { JobStatus } from '@aps/shared';

/** Tỷ lệ tiến trình tổng: render chiếm 0–92%, ghép video 92–100%. */
export function overallProgress(status: JobStatus, frame: number, total: number, encodedFrames = 0): number {
  if (status === 'done') return 1;
  if (status === 'queued' || status === 'preparing') return 0;
  const t = Math.max(1, total);
  if (status === 'encoding') return 0.92 + 0.08 * Math.min(1, encodedFrames / t);
  return 0.92 * Math.min(1, frame / t);
}

/** Ước thời gian còn lại (giây) từ thời gian đã chạy và số khung xong; null nếu chưa đủ dữ liệu. */
export function estimateRemainingSeconds(elapsedS: number, framesDone: number, total: number): number | null {
  if (framesDone <= 0 || elapsedS <= 0) return null;
  const remaining = Math.max(0, total - framesDone);
  return Math.round((elapsedS / framesDone) * remaining);
}
