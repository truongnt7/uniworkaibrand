import { LOGO_POSITIONS, TIMELINE_VERSION, Timeline, type Aspect, type CameraSegment, type LogoSegment, type ProductSegment, type Speed } from '../timeline/schema.js';
import { DEFAULT_TEMPLATES, type DirectorContext } from './types.js';

/** Hạ chữ thường, bỏ dấu tiếng Việt để khớp từ khoá bền với người gõ không dấu. */
export function fold(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

type CameraItem = Pick<CameraSegment, 'move' | 'from' | 'degrees' | 'amount' | 'ease'>;
type ProductItem = Pick<ProductSegment, 'motion' | 'turns' | 'speed' | 'ease'>;

const RE = {
  cameraWord: /\b(camera|may quay|goc may|goc quay)\b/,
  orbit: /quanh|orbit|vong tron\b/,
  dollyIn: /tien (gan|vao|toi|den|len)|lai gan|can canh|zoom (vao|in)|dolly in|day (camera )?(vao|gan)|keo (camera )?(vao|gan)|gan hon|cang luc cang gan/,
  dollyOut: /lui (xa|ra|lai|dan)|zoom (ra|out)|dolly out|keo (camera )?ra( xa)?|ra xa|xa dan/,
  cameraStatic: /(camera|goc may) (co dinh|dung yen|dung im|khong (di chuyen|chuyen dong))|co dinh (camera|goc may)/,
  spin: /\b(xoay|quay|spin|turntable)\b|360/,
  productSpin: /\b(xoay|quay|spin)\s+(cham\s+|nhanh\s+)?(chai|hop|tui|lo|san pham|sp|no|tron)\b|\bxoay 360|spin360/,
  notSpin: /quay (video|phim|clip|hinh)/,
  still: /(khong|dung|ngung|thoi) (xoay|quay)|dung yen|dung im|dung lai|(san pham|chai|hop|tui|lo) (dung yen|co dinh)/,
  slow: /\bcham\b|tu tu|nhe nhang|thong tha|thu thai/,
  fast: /\bnhanh\b|manh me|soi dong|nang dong|day nang luong/,
  low: /goc thap|tu duoi (len|nhin)|nhin tu duoi/,
  high: /goc cao|tu tren (xuong|nhin)|nhin tu tren|goc nhin tu tren/,
  linear: /\b(deu|deu dan|tuyen tinh)\b/,
  reverse: /nguoc chieu|nguoc kim|nguoc lai/,
  logo: /\blogo\b/,
  lift: /\b(nang|nhac|bay len|nhac len)\b/,
  music: /nhac nen|am nhac|\bmusic\b|\bnhac\b/,
  unlockLabel: /(khong giu|bo|xoa|bien|doi|thay) (nguyen )?nhan\b|\bkhong can nhan\b/,
};

const SPLIT = /[;\n]+|[,.](?!\d)|\b(?:roi|sau do|tiep theo|tiep tuc|sau cung|cuoi cung|va)\b/;

function parseDuration(text: string, warnings: string[]): number | undefined {
  const num = String.raw`(\d+(?:_\d+)?)`;
  const toNum = (s: string) => Number(s.replace('_', '.'));
  const min = new RegExp(`${num}\\s*phut`).exec(text);
  const sec = new RegExp(`${num}\\s*(?:giay|sec|s)\\b`).exec(text);
  let d: number | undefined;
  if (/nua phut/.test(text)) d = 30;
  else if (min) d = toNum(min[1]!) * 60;
  else if (sec) d = toNum(sec[1]!);
  if (d === undefined) return undefined;
  if (d < 2 || d > 60) {
    const clamped = Math.min(60, Math.max(2, d));
    warnings.push(`duration_clamped: ${d}s nằm ngoài [2, 60], dùng ${clamped}s`);
    return clamped;
  }
  return d;
}

function parseAspect(text: string): Aspect | undefined {
  if (/\b9\s*:\s*16\b|\bdoc\b|reels?\b|tiktok|story|stories|shorts?\b|man hinh doc/.test(text)) return '9:16';
  if (/\b4\s*:\s*5\b/.test(text)) return '4:5';
  if (/\b1\s*:\s*1\b|\bvuong\b|instagram feed|feed instagram/.test(text)) return '1:1';
  if (/\b16\s*:\s*9\b|\bngang\b|youtube|man hinh ngang|man hinh rong/.test(text)) return '16:9';
  return undefined;
}

function parseSpeed(clause: string): Speed | undefined {
  if (RE.slow.test(clause)) return 'slow';
  if (RE.fast.test(clause)) return 'fast';
  return undefined;
}

function parseDegrees(clause: string): number | undefined {
  const m = /(\d{2,3})\s*(?:do|°)/.exec(clause);
  let deg: number | undefined;
  if (m) deg = Number(m[1]);
  else if (/nua vong|mot nua/.test(clause)) deg = 180;
  else if (/(mot|1|tron|tat ca|toan) vong|\bmot vong\b|vong tron/.test(clause)) deg = 360;
  if (deg === undefined) return undefined;
  deg = Math.min(360, deg);
  return RE.reverse.test(clause) ? -deg : deg;
}

interface Allocation<T> {
  t: number;
  t_end: number;
  item: T;
}

function allocate<T>(items: T[], duration: number): Allocation<T>[] {
  const n = items.length;
  const step = duration / n;
  return items.map((item, i) => ({
    t: round1(i * step),
    t_end: i === n - 1 ? round1(duration) : round1((i + 1) * step),
    item,
  }));
}

const round1 = (n: number): number => Math.round(n * 100) / 100;

function pickTemplate(text: string, available: readonly string[], warnings: string[]): string {
  const wants: { re: RegExp; id: string }[] = [
    { re: /thien nhien|la cay|cay la|\bla\b|\bvuon\b|\brung\b|cay coi|xanh mat|tu nhien/, id: 'nature-soft' },
    { re: /toi gian|\btrang\b|don gian|minimal|nen trang|sach se/, id: 'minimal-white' },
    { re: /cao cap|sang trong|luxury|sang chanh|nen toi|bong toi|\bdark\b|dang cap/, id: 'luxury-dark' },
    { re: /\bstudio\b/, id: 'studio-soft' },
  ];
  const hit = wants.find((w) => w.re.test(text));
  if (!hit) return available.includes('studio-soft') ? 'studio-soft' : (available[0] ?? 'studio-soft');
  if (available.includes(hit.id)) return hit.id;
  warnings.push(`template_unavailable: mẫu "${hit.id}" chưa có, dùng mẫu mặc định`);
  return available.includes('studio-soft') ? 'studio-soft' : (available[0] ?? 'studio-soft');
}

export interface RulesDiagnostics {
  /** Từ khoá/nhận diện đã khớp, dùng cho debug và golden test. */
  matched: string[];
}

/** AI-lite: parse từ khoá tiếng Việt → timeline. Thuần hàm, offline, kết quả xác định. */
export function directFromRules(prompt: string, ctx: DirectorContext = {}): { timeline: Timeline; warnings: string[]; diagnostics: RulesDiagnostics } {
  const warnings: string[] = [];
  const matched: string[] = [];
  const text = fold(prompt).replace(/(\d)[.,](\d)/g, '$1_$2').replace(/xung quanh/g, 'xq');
  if (text.length === 0) warnings.push('empty_prompt: prompt rỗng, dùng timeline mặc định');

  const clauses = text.split(SPLIT).map((c) => c.trim()).filter(Boolean);

  const cameraItems: CameraItem[] = [];
  const productItems: ProductItem[] = [];
  let logoClause: string | undefined;
  let globalSpeed: Speed | undefined;

  for (const clause of clauses) {
    const speed = parseSpeed(clause);
    globalSpeed ??= speed;
    const hasCameraWord = RE.cameraWord.test(clause);
    const ease = RE.linear.test(clause) ? 'linear' : 'smooth';
    const from = RE.low.test(clause) ? 'low' : RE.high.test(clause) ? 'high' : 'eye_level';

    if (RE.logo.test(clause)) {
      logoClause ??= clause;
      matched.push('logo');
    }
    if (RE.lift.test(clause) && /san pham|chai|hop|tui|lo\b/.test(clause)) {
      warnings.push('unsupported_motion: "nâng sản phẩm" thuộc V1, MVP chưa hỗ trợ');
    }

    let camera: CameraItem | undefined;
    if (RE.cameraStatic.test(clause)) {
      camera = { move: 'static', from, degrees: 90, amount: 0.3, ease };
    } else if (RE.dollyOut.test(clause)) {
      camera = { move: 'dolly_out', from, degrees: 90, amount: 0.3, ease };
    } else if (RE.dollyIn.test(clause)) {
      const close = /can canh|rat gan|sat/.test(clause);
      camera = { move: 'dolly_in', from, degrees: 90, amount: close ? 0.45 : 0.3, ease };
    } else if (RE.orbit.test(clause) || (hasCameraWord && /\b(xoay|quay)\b/.test(clause))) {
      camera = { move: 'orbit', from, degrees: parseDegrees(clause) ?? 90, amount: 0.3, ease };
    }
    if (camera) {
      cameraItems.push(camera);
      matched.push(`camera:${camera.move}`);
    }

    const productSpin = RE.productSpin.test(clause) || (!camera && RE.spin.test(clause) && !RE.notSpin.test(clause));
    if (RE.still.test(clause)) {
      productItems.push({ motion: 'still', turns: 1, speed: speed ?? 'normal', ease });
      matched.push('product:still');
    } else if (productSpin && !RE.logo.test(clause)) {
      const turnsMatch = /(\d+)\s*vong/.exec(clause);
      const turns = turnsMatch ? Math.min(4, Math.max(1, Number(turnsMatch[1]))) : 1;
      productItems.push({ motion: 'spin360', turns, speed: speed ?? 'normal', ease });
      matched.push('product:spin360');
    }
  }

  if (RE.music.test(text)) warnings.push('unsupported_feature: nhạc nền thuộc V1, bỏ qua');
  if (RE.unlockLabel.test(text)) warnings.push('label_locked: Giữ nguyên nhãn luôn bật, yêu cầu đổi/bỏ nhãn bị bỏ qua');

  const explicitDuration = parseDuration(text, warnings);
  const dominantSpeed = globalSpeed ?? productItems.find((p) => p.speed !== 'normal')?.speed;
  const duration =
    explicitDuration ?? ctx.defaultDurationS ?? (dominantSpeed === 'slow' ? 12 : dominantSpeed === 'fast' ? 8 : 10);
  if (explicitDuration !== undefined) matched.push('duration');

  const aspectFound = parseAspect(text);
  if (aspectFound) matched.push(`aspect:${aspectFound}`);
  const aspect = aspectFound ?? ctx.defaultAspect ?? '16:9';

  if (productItems.length === 0) {
    productItems.push({ motion: 'spin360', turns: 1, speed: dominantSpeed ?? 'normal', ease: 'smooth' });
    warnings.push('defaulted_product_motion: prompt không nêu chuyển động sản phẩm, mặc định xoay 360°');
  }
  for (const p of productItems) {
    if (p.motion === 'spin360' && p.speed === 'normal' && dominantSpeed) p.speed = dominantSpeed;
    if (p.motion === 'spin360' && p.speed === 'fast' && p.turns === 1) p.turns = 2;
  }

  const product: ProductSegment[] = allocate(productItems, duration).map(({ t, t_end, item }) => ({ t, t_end, ...item }));
  const camera: CameraSegment[] = allocate(cameraItems, duration).map(({ t, t_end, item }) => ({ t, t_end, ...item }));
  if (cameraItems.length === 0) camera.length = 0;

  const logo: LogoSegment[] = [];
  const wantsLogo = logoClause !== undefined;
  if (wantsLogo && ctx.hasLogo === false) {
    warnings.push('no_logo_asset: prompt có logo nhưng sản phẩm chưa có logo, bỏ track logo');
  } else if (wantsLogo) {
    const c = logoClause!;
    const len = round1(Math.min(4, Math.max(2, duration * 0.25)));
    const atStart = /\b(dau|mo dau|bat dau|ban dau)\b/.test(c) && !/(ket thuc|cuoi)/.test(c);
    // "ở giữa video" thường chỉ vị trí logo, không phải thời điểm; chỉ coi là giữa thời gian khi nói rõ "đoạn/khoảng giữa".
    const atMiddle = /\b(doan|khoang|luc) giua\b/.test(c) && !/(ket thuc|cuoi)/.test(c);
    const t = atStart ? 0 : atMiddle ? round1((duration - len) / 2) : round1(duration - len);
    let position: (typeof LOGO_POSITIONS)[number] = 'center';
    if (/goc (duoi )?phai|phai duoi/.test(c)) position = 'bottom_right';
    else if (/goc (duoi )?trai|trai duoi/.test(c)) position = 'bottom_left';
    else if (/goc tren phai|phai tren/.test(c)) position = 'top_right';
    else if (/goc tren trai|trai tren/.test(c)) position = 'top_left';
    else if (/phia duoi|o duoi|duoi cung/.test(c)) position = 'bottom_center';
    const anim = /truot/.test(c) ? 'slide_up' : /(khong (hieu ung|animation)|hien ngay)/.test(c) ? 'none' : 'fade_in';
    logo.push({ t, t_end: round1(t + len), anim, position });
  }

  const available = ctx.availableTemplates ?? DEFAULT_TEMPLATES;
  const template_id = pickTemplate(text, available, warnings);
  if (template_id !== 'studio-soft') matched.push(`template:${template_id}`);

  const hide: ('platform' | 'leaves' | 'props')[] = [];
  if (/(khong|bo|tat|an|tranh)( co)? (la|cay)\b/.test(text)) hide.push('leaves');
  if (/(khong|bo|tat|an)( co)? (buc|ke|de |be )/.test(text)) hide.push('platform');
  if (/(khong|bo|tat|an)( co)? (dao cu|props)/.test(text)) hide.push('props');
  const palette = /tong (am|nong)/.test(text) ? 'warm' : /tong (lanh|mat)/.test(text) ? 'cool' : /tong toi|\bdark\b/.test(text) ? 'dark' : /trung tinh|mau trung tinh/.test(text) ? 'neutral' : 'brand';

  const timeline = Timeline.parse({
    version: TIMELINE_VERSION,
    aspect,
    duration_s: duration,
    fps: ctx.fps ?? 30,
    tracks: { product, camera, logo },
    scene: { template_id, hide, palette },
    lock_label: true,
  });
  return { timeline, warnings, diagnostics: { matched } };
}
