/**
 * Kiểm tra tự động một binary ffmpeg theo chính sách LGPL (dùng trong CI và khi chọn bản phân phối):
 *   pnpm --filter @aps/desktop verify:ffmpeg /đường/dẫn/ffmpeg
 * Thoát mã 1 nếu binary bật --enable-gpl/--enable-nonfree, thư viện GPL, hoặc không có encoder H.264 được phép.
 */
import { inspectFfmpeg } from '../src/orchestrator/ffmpeg.js';

const bin = process.argv[2];
if (!bin) {
  console.error('Dùng: verify:ffmpeg <đường dẫn ffmpeg>');
  process.exit(2);
}
async function main(): Promise<void> {
const { report, encoder, encoders } = await inspectFfmpeg(bin as string);
console.log(`ffmpeg ${report.version ?? '?'}  version3=${report.version3}  encoder được chọn: ${encoder ?? '(không có)'}`);
console.log(`H.264 có trong binary: ${encoders.filter((e) => /264/.test(e)).join(', ') || '(không)'}`);
if (!report.ok) {
  console.error('KHÔNG ĐẠT chính sách LGPL:\n - ' + report.violations.join('\n - '));
  process.exit(1);
}
if (!encoder) {
  console.error('KHÔNG ĐẠT: không có encoder H.264 trong danh sách cho phép');
  process.exit(1);
}
console.log('ĐẠT chính sách LGPL (không --enable-gpl, không --enable-nonfree, không thư viện GPL).');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
