import sharp from 'sharp';

/**
 * Ảnh tổng hợp "chai trên nền bàn" (SVG → PNG) kèm mask đáp án. CHỈ để kiểm thử cơ học (kích thước, thời gian, IoU thô);
 * không thay thế đánh giá trên ảnh sản phẩm thật.
 */
export async function syntheticBottle(width = 1024, height = 1024): Promise<{ image: Buffer; truth: Buffer }> {
  const cx = width / 2;
  const bw = width * 0.22;
  const top = height * 0.12;
  const bottom = height * 0.88;
  const shoulder = top + (bottom - top) * 0.3;
  const neck = bw * 0.38;
  const bodyPath = `M ${cx - neck} ${top} L ${cx + neck} ${top} L ${cx + neck} ${shoulder - 40} Q ${cx + bw} ${shoulder - 10} ${cx + bw} ${shoulder + 60} L ${cx + bw} ${bottom - 20} Q ${cx + bw} ${bottom} ${cx + bw - 30} ${bottom} L ${cx - bw + 30} ${bottom} Q ${cx - bw} ${bottom} ${cx - bw} ${bottom - 20} L ${cx - bw} ${shoulder + 60} Q ${cx - bw} ${shoulder - 10} ${cx - neck} ${shoulder - 40} Z`;
  const bg = `
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9cfc1"/><stop offset="1" stop-color="#a99b88"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3414"/><stop offset="0.35" stop-color="#b87a2e"/><stop offset="1" stop-color="#4a2a10"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>`;
  const svg = (inner: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${inner}</svg>`);
  const image = await sharp(
    svg(`${bg}<ellipse cx="${cx}" cy="${bottom + 8}" rx="${bw * 1.1}" ry="14" fill="#00000055"/>
    <path d="${bodyPath}" fill="url(#glass)"/>
    <rect x="${cx - bw * 0.7}" y="${shoulder + 110}" width="${bw * 1.4}" height="${(bottom - shoulder) * 0.4}" fill="#f4efe6"/>
    <rect x="${cx - neck - 6}" y="${top - 38}" width="${neck * 2 + 12}" height="42" fill="#222"/>`),
  )
    .png()
    .toBuffer();
  const truthSvg = svg(`<rect width="100%" height="100%" fill="black"/><path d="${bodyPath}" fill="white"/><rect x="${cx - neck - 6}" y="${top - 38}" width="${neck * 2 + 12}" height="42" fill="white"/>`);
  const truth = await sharp(truthSvg).extractChannel(0).raw().toBuffer();
  return { image, truth };
}

export function iou(mask: Uint8Array, truth: Uint8Array, threshold = 128): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i]! >= threshold;
    const b = truth[i]! >= threshold;
    if (a && b) inter++;
    if (a || b) union++;
  }
  return union === 0 ? 1 : inter / union;
}
