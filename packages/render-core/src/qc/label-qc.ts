import { decodePng, type Raster } from './png.js';
import { normalizeGray, resizeGray, ssim, toGray } from './ssim.js';
import { ocrMatchRatio } from './ocr.js';
import { centerTiltDeg, rectifyLabel, visibleFraction, type ProjectionGrid } from './rectify.js';

export const QC_DEFAULTS = {
  /** Ngưỡng SSIM (sau chuẩn hóa sáng/tương phản) giữa nhãn gốc và nhãn trong khung đã nắn phẳng. */
  ssimMin: 0.55,
  /** Nhãn nghiêng hơn góc này so với hướng camera → cảnh báo "khó đọc", không tính là lỗi dựng. */
  readableTiltMaxDeg: 55,
  /** Nhãn nhìn thấy dưới tỉ lệ này → coi là "khuất" (mặt sau chai), bỏ qua. */
  visibleMin: 0.45,
  ocrMin: 0.6,
  compareWidth: 192,
  /** Khung đọc OCR tốt nhất trong vòng xoay phải khớp ít nhất ~1 từ trong 4 (ngưỡng thấp có chủ ý: OCR nhãn cong ở 960x540 rất yếu; đây là kiểm "nhãn đúng/chữ còn đọc được", không phải kiểm chính tả). */
  sweepOcrBestMin: 0.25,
  /** Tỉ lệ khung hợp lệ (không khuất/nghiêng) phải đạt để sản phẩm "đạt QC" khi xoay 360°. */
  sweepPassRatio: 0.9,
} as const;

export type QcConfig = { -readonly [K in keyof typeof QC_DEFAULTS]: number };

export type FrameVerdict = 'pass' | 'fail' | 'tilted' | 'hidden';

export interface FrameQc {
  verdict: FrameVerdict;
  ssim: number;
  ssimCoverage: number;
  tiltDeg: number;
  visible: number;
  ocr?: number;
  reasons: string[];
}

export interface QcInput {
  frame: Raster | Uint8Array;
  label: Raster | Uint8Array;
  grid: ProjectionGrid;
  /** `expected` = chữ OCR được từ nhãn gốc đã che CÙNG vùng khuất với khung (hoặc chữ khai báo); `recognized` = OCR trên khung đã nắn phẳng. */
  ocrText?: { expected: string; recognized: string };
  config?: Partial<QcConfig>;
}

const asRaster = (x: Raster | Uint8Array): Raster => (x instanceof Uint8Array ? decodePng(x) : x);

export function rectifiedFor(input: Pick<QcInput, 'frame' | 'label' | 'grid'>, width: number = QC_DEFAULTS.compareWidth) {
  const label = asRaster(input.label);
  const frame = asRaster(input.frame);
  const w = width;
  const h = Math.max(8, Math.round((width * label.height) / label.width));
  const ref = resizeGray(toGray(label), w, h);
  const got = rectifyLabel(toGray(frame, 0), input.grid, w, h);
  return { ref, got, w, h };
}

export function assessLabelFrame(input: QcInput): FrameQc {
  const cfg: QcConfig = { ...QC_DEFAULTS, ...input.config };
  const tiltDeg = centerTiltDeg(input.grid);
  const visible = visibleFraction(input.grid);
  const base = { tiltDeg, visible, ssim: 0, ssimCoverage: 0, reasons: [] as string[] };
  if (visible < cfg.visibleMin) return { ...base, verdict: 'hidden', reasons: ['nhãn khuất (mặt sau/quá nghiêng)'] };
  if (tiltDeg > cfg.readableTiltMaxDeg) {
    return { ...base, verdict: 'tilted', reasons: [`nhãn nghiêng ${tiltDeg.toFixed(0)}° > ${cfg.readableTiltMaxDeg}°, khó đọc`] };
  }
  const { ref, got } = rectifiedFor(input, cfg.compareWidth);
  const r = ssim(normalizeGray(ref), normalizeGray(got));
  const reasons: string[] = [];
  let ok = true;
  if (r.valid < 0.25) {
    ok = false;
    reasons.push(`vùng so sánh quá nhỏ (${(r.valid * 100).toFixed(0)}%)`);
  }
  if (r.score < cfg.ssimMin) {
    ok = false;
    reasons.push(`SSIM ${r.score.toFixed(2)} < ${cfg.ssimMin}`);
  }
  // OCR trên nhãn cong ở độ phân giải khung dựng rất nhiễu từng khung, nên chỉ ghi nhận ở đây;
  // điều kiện đạt của OCR áp ở mức cả vòng xoay (khung đọc tốt nhất), xem summarizeSweep.
  const ocr = input.ocrText ? ocrMatchRatio(input.ocrText.expected, input.ocrText.recognized) : undefined;
  return { ...base, ssim: r.score, ssimCoverage: r.valid, ocr, verdict: ok ? 'pass' : 'fail', reasons };
}

export interface SweepQc {
  frames: number;
  considered: number;
  passed: number;
  tilted: number;
  hidden: number;
  passRatio: number;
  /** Tỉ lệ khớp OCR cao nhất giữa các khung xét được; null nếu không có dữ liệu OCR. */
  ocrBest: number | null;
  productPass: boolean;
  warnings: string[];
}

/** Tổng hợp một vòng xoay 360°: đạt nếu ≥ sweepPassRatio số khung "xét được" (không khuất/nghiêng) đạt SSIM, đủ khung xét được, và OCR tốt nhất đạt ngưỡng. */
export function summarizeSweep(frames: FrameQc[], config: Partial<QcConfig> = {}): SweepQc {
  const cfg: QcConfig = { ...QC_DEFAULTS, ...config };
  const considered = frames.filter((f) => f.verdict === 'pass' || f.verdict === 'fail');
  const passed = considered.filter((f) => f.verdict === 'pass').length;
  const tilted = frames.filter((f) => f.verdict === 'tilted').length;
  const hidden = frames.filter((f) => f.verdict === 'hidden').length;
  const warnings: string[] = [];
  if (tilted) warnings.push(`${tilted}/${frames.length} khung nhãn nghiêng quá ngưỡng đọc được`);
  const passRatio = considered.length ? passed / considered.length : 0;
  const ocrs = considered.map((f) => f.ocr).filter((v): v is number => v !== undefined);
  const ocrBest = ocrs.length ? Math.max(...ocrs) : null;
  if (ocrBest !== null && ocrBest < cfg.sweepOcrBestMin) warnings.push(`chữ trên nhãn không đọc được (OCR tốt nhất ${(ocrBest * 100).toFixed(0)}% < ${(cfg.sweepOcrBestMin * 100).toFixed(0)}%)`);
  if (considered.length < Math.max(1, Math.floor(frames.length * 0.15))) warnings.push('quá ít khung nhìn thấy nhãn rõ để đánh giá');
  return {
    frames: frames.length,
    considered: considered.length,
    passed,
    tilted,
    hidden,
    passRatio,
    ocrBest,
    productPass:
      considered.length >= Math.max(1, Math.floor(frames.length * 0.15)) && passRatio >= cfg.sweepPassRatio && (ocrBest === null || ocrBest >= cfg.sweepOcrBestMin),
    warnings,
  };
}
