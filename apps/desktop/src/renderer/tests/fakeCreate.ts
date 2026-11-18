import type { BusinessProfile, BusinessProfilePatch, Draft, DraftSaveReq, DraftSummary, JobRecord, RuntimePackageId, RuntimeProgress, RuntimeStatus, SlideshowCreateReqInput } from '@aps/shared';
import { FIELD_KEYS, buildCaptions, getTemplate, validateInput, type FieldValues, type TemplateUserInput } from '@aps/templates';
import type { CreateService, PickKind } from '../src/services/create';

const noRuntime = { installed: true, ffmpegPath: '/usr/bin/ffmpeg' } as unknown as RuntimeStatus;

function userInput(req: Pick<SlideshowCreateReqInput, 'input'>): TemplateUserInput {
  const values: FieldValues = {};
  for (const key of FIELD_KEYS) {
    const v = req.input?.values?.[key];
    if (typeof v === 'string') values[key] = v;
  }
  return { values, photos: { ...(req.input?.photos ?? {}) }, captions: { ...(req.input?.captions ?? {}) } };
}

/** Dịch vụ giả lập cho test giao diện: dùng schema thật của @aps/templates, hàng đợi trong bộ nhớ. */
export class FakeCreateService implements CreateService {
  profile: BusinessProfile = {};
  picks: Partial<Record<PickKind, string[]>> = {};
  jobs: JobRecord[] = [];
  created: SlideshowCreateReqInput[] = [];
  clipboard: string[] = [];
  saved: string[] = [];
  runtime: RuntimeStatus = noRuntime;
  private listeners = new Set<(j: JobRecord) => void>();
  private seq = 0;

  available = () => true;
  profileGet = async () => ({ ...this.profile });
  profileSet = async (patch: BusinessProfilePatch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete (this.profile as Record<string, unknown>)[k];
      else (this.profile as Record<string, unknown>)[k] = v;
    }
    return { ...this.profile };
  };
  pick = async (kind: PickKind) => this.picks[kind]?.shift() ?? null;
  pathForFile = (file: File) => `/dropped/${file.name}`;
  thumbnail = async () => ({ dataUrl: null });
  /** Mô phỏng chuyển HEIC: đường dẫn .heic/.heif -> .jpg trong thư mục dữ liệu; đặt `prepareError` để mô phỏng ảnh hỏng. */
  prepared: string[] = [];
  prepareError: string | null = null;
  preparePhoto = async (path: string) => {
    this.prepared.push(path);
    if (/\.(heic|heif)$/i.test(path) && this.convertHeic) {
      if (this.prepareError) throw Object.assign(new Error('hỏng'), { code: this.prepareError });
      return { path: `/du-lieu/uploads/${path.split('/').pop()!.replace(/\.(heic|heif)$/i, '')}.jpg`, converted: true };
    }
    return { path, converted: false };
  };
  convertHeic = false;
  drafts = new Map<string, Draft>();
  missingPaths: string[] = [];
  private draftSeq = 0;
  draftsList = async (): Promise<DraftSummary[]> =>
    [...this.drafts.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(({ form: _f, missing: _m, ...summary }) => summary);
  draftGet = async (id: string) => {
    const d = this.drafts.get(id);
    return d ? { ...d, missing: this.missingPaths } : null;
  };
  draftSaves: DraftSaveReq[] = [];
  draftSave = async (req: DraftSaveReq) => {
    this.draftSaves.push(req);
    const now = Date.now();
    const id = req.id ?? `draft-${++this.draftSeq}`;
    const old = this.drafts.get(id);
    const form = { industry: null, templateId: null, aspect: null, values: {}, photos: {}, captions: {}, logoPath: null, musicPath: null, ...req.form } as Draft['form'];
    const draft: Draft = { id, name: req.name.trim() || 'Bài chưa đặt tên', industry: form.industry, templateId: form.templateId, photoCount: Object.keys(form.photos).length, createdAt: old?.createdAt ?? now, updatedAt: now, form, missing: [] };
    this.drafts.set(id, draft);
    const { form: _f, missing: _m, ...summary } = draft;
    return summary;
  };
  draftRemove = async (id: string) => this.drafts.delete(id);
  validate = async (req: SlideshowCreateReqInput) => {
    const t = getTemplate(req.templateId)!;
    const r = validateInput(t, userInput(req), { aspect: req.aspect ?? t.defaultAspect });
    return r.ok ? { ok: true, issues: [], warnings: [...r.warnings] } : { ok: false, issues: [...r.issues], warnings: [] };
  };
  create = async (req: SlideshowCreateReqInput) => {
    this.created.push(req);
    const now = Date.now();
    const job = {
      id: `job-${++this.seq}`,
      name: req.name ?? 'Video thử',
      status: 'queued',
      progress: 0,
      target: 'local',
      pipeline: 'slideshow',
      engine: 'ffmpeg',
      createdAt: now,
      updatedAt: now,
      estimateS: null,
      errorCode: null,
      errorMessage: null,
      request: { pipeline: 'slideshow', quality: req.quality ?? 'final' },
    } as unknown as JobRecord;
    this.jobs.unshift(job);
    this.emit(job);
    return { job, warnings: [] };
  };
  captions = async (req: Pick<SlideshowCreateReqInput, 'templateId' | 'input'>) => buildCaptions(getTemplate(req.templateId)!, userInput(req));
  createFromPrompt = async () => {
    throw new Error('không dùng trong test');
  };
  runtimeStatus = async () => this.runtime;
  installRequests: RuntimePackageId[][] = [];
  progressListeners = new Set<(p: RuntimeProgress) => void>();
  runtimeInstall = async (packages?: RuntimePackageId[]) => {
    this.installRequests.push(packages ?? []);
    return this.runtime;
  };
  onRuntimeProgress = (l: (p: RuntimeProgress) => void) => {
    this.progressListeners.add(l);
    return () => void this.progressListeners.delete(l);
  };
  jobsList = async () => [...this.jobs];
  onJobChanged = (l: (j: JobRecord) => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  cancel = async (id: string) => {
    this.patch(id, { status: 'canceled' });
    return true;
  };
  retry = async (id: string) => {
    this.patch(id, { status: 'queued', errorCode: null, errorMessage: null, progress: 0 });
    return true;
  };
  remove = async (id: string) => {
    this.jobs = this.jobs.filter((j) => j.id !== id);
    return true;
  };
  saveVideo = async (jobId: string) => {
    this.saved.push(jobId);
    return `/home/nguoidung/Videos/${jobId}.mp4`;
  };
  reveal = async () => true;
  copyText = async (text: string) => {
    this.clipboard.push(text);
  };
  videoUrl = (job: Pick<JobRecord, 'id'>) => `asset://job/${job.id}/output`;

  patch(id: string, fields: Partial<JobRecord>): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    Object.assign(job, fields, { updatedAt: Math.max(job.updatedAt + 1, Date.now()) });
    this.emit(job);
  }
  private emit(job: JobRecord): void {
    for (const l of this.listeners) l({ ...job });
  }
}
