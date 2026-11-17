import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import {
  AppError,
  SlideshowRequest,
  type CaptionResult,
  type InputIssue,
  type SlideshowCreateReq,
  type SlideshowValidateRes,
} from '@aps/shared';
import {
  FIELD_KEYS,
  TemplateInputError,
  buildCaptions,
  compileTemplate,
  getTemplate,
  validateInput,
  type FieldValues,
  type Template,
  type TemplateUserInput,
} from '@aps/templates';

export interface SlideshowServiceOptions {
  fontPath: string;
}

export interface PreparedSlideshow {
  id: string;
  request: SlideshowRequest;
  warnings: InputIssue[];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function userInput(req: Pick<SlideshowCreateReq, 'input'>): TemplateUserInput {
  const values: FieldValues = {};
  for (const key of FIELD_KEYS) {
    const v = req.input.values[key];
    if (typeof v === 'string') values[key] = v;
  }
  return { values, photos: { ...req.input.photos }, captions: { ...req.input.captions } };
}

function mustTemplate(id: string): Template {
  const t = getTemplate(id);
  if (!t) throw new AppError('TEMPLATE_NOT_FOUND', `Không tìm thấy mẫu "${id}". Hãy chọn lại mẫu.`);
  return t;
}

/** Kiểm tra dữ liệu bằng schema của @aps/templates (SĐT, giá, ảnh HEIC, độ dài...) và kiểm tệp có tồn tại. Không bao giờ ném lỗi nghiệp vụ. */
export async function validateSlideshow(req: SlideshowCreateReq): Promise<SlideshowValidateRes> {
  const template = mustTemplate(req.templateId);
  const checked = validateInput(template, userInput(req), { aspect: req.aspect ?? template.defaultAspect });
  const issues: InputIssue[] = checked.ok ? [] : [...checked.issues];
  const warnings: InputIssue[] = checked.ok ? [...checked.warnings] : [];
  if (checked.ok) {
    for (const [slot, path] of Object.entries(checked.input.photos)) {
      if (!(await isFile(path))) {
        const label = template.photos.find((p) => p.id === slot)?.label ?? slot;
        issues.push({ field: `photo:${slot}`, code: 'photo_not_found', message: `Không tìm thấy ảnh "${label}". Có thể ảnh đã bị xoá hoặc di chuyển, hãy chọn lại ảnh.` });
      }
    }
  }
  if (req.logoPath && !(await isFile(req.logoPath))) issues.push({ field: 'logo', code: 'logo_not_found', message: 'Không tìm thấy tệp logo. Hãy chọn lại logo hoặc bỏ logo.' });
  if (req.musicPath && !(await isFile(req.musicPath))) issues.push({ field: 'music', code: 'music_not_found', message: 'Không tìm thấy tệp nhạc. Hãy chọn lại nhạc hoặc chọn "không nhạc".' });
  return { ok: issues.length === 0, issues, warnings };
}

/** Biên dịch mẫu + dữ liệu thành job slideshow (tất định). Ném `AppError` nếu dữ liệu không hợp lệ. */
export async function prepareSlideshow(req: SlideshowCreateReq, opts: SlideshowServiceOptions): Promise<PreparedSlideshow> {
  const template = mustTemplate(req.templateId);
  const checked = await validateSlideshow(req);
  if (!checked.ok) throw new AppError('TEMPLATE_INPUT_INVALID', checked.issues.map((i) => i.message).join(' '), { issues: checked.issues });
  const id = randomUUID();
  const aspect = req.aspect ?? template.defaultAspect;
  let compiled;
  try {
    compiled = compileTemplate(template, userInput(req), {
      jobId: id,
      fontPath: opts.fontPath,
      aspect,
      quality: req.quality,
      ...(req.brandColor ? { brandColor: req.brandColor } : {}),
      ...(req.logoPath ? { logoPath: req.logoPath } : {}),
      ...(req.musicPath ? { musicPath: req.musicPath } : {}),
    });
  } catch (err) {
    if (err instanceof TemplateInputError) throw new AppError('TEMPLATE_INPUT_INVALID', err.message, { issues: err.issues });
    throw new AppError('SLIDESHOW_TOO_COMPLEX', 'Video có quá nhiều cảnh/chữ để dựng một lần. Hãy bớt số cảnh hoặc rút gọn chữ.');
  }
  const businessName = req.input.values.businessName?.trim();
  const request = SlideshowRequest.parse({
    pipeline: 'slideshow',
    name: req.name ?? `${template.name}${businessName ? ` - ${businessName}` : ''}`.slice(0, 120),
    target: req.target,
    priority: req.quality === 'preview' ? 'preview' : 'final',
    templateId: template.id,
    aspect,
    quality: req.quality,
    input: req.input,
    ...(req.logoPath ? { logoPath: req.logoPath } : {}),
    ...(req.musicPath ? { musicPath: req.musicPath } : {}),
    ...(req.brandColor ? { brandColor: req.brandColor } : {}),
    job: compiled.job,
  });
  return { id, request, warnings: checked.warnings };
}

/** Caption 3 kênh từ đúng dữ liệu người dùng nhập. Dữ liệu chưa hợp lệ -> danh sách rỗng (UI hiện lỗi từ `slideshow:validate`). */
export function slideshowCaptions(req: Pick<SlideshowCreateReq, 'templateId' | 'input'>): CaptionResult[] {
  const template = mustTemplate(req.templateId);
  try {
    return buildCaptions(template, userInput(req));
  } catch (err) {
    if (err instanceof TemplateInputError) return [];
    throw err;
  }
}
