import type {
  BusinessProfile,
  BusinessProfilePatch,
  CaptionResult,
  CreateFromPromptReq,
  DirectorInfo,
  InputIssue,
  JobRecord,
  RuntimeStatus,
  SlideshowCreateReqInput,
  SlideshowValidateRes,
} from '@aps/shared';
import { invoke, subscribe } from '../api';

export type PickKind = 'photo' | 'logo' | 'audio' | 'glb' | 'image';

export interface ThumbnailResult {
  dataUrl: string | null;
}

/** Mọi thao tác của màn "Tạo video" đi qua interface này (IPC có kiểu ở bản thật, giả lập trong test). */
export interface CreateService {
  /** false khi chạy ngoài Electron (không có cầu nối IPC). */
  available(): boolean;
  profileGet(): Promise<BusinessProfile>;
  profileSet(patch: BusinessProfilePatch): Promise<BusinessProfile>;
  pick(kind: PickKind): Promise<string | null>;
  /** Đường dẫn của tệp được kéo thả; rỗng nếu không xác định. */
  pathForFile(file: File): string;
  thumbnail(path: string): Promise<ThumbnailResult>;
  validate(req: SlideshowCreateReqInput): Promise<SlideshowValidateRes>;
  create(req: SlideshowCreateReqInput): Promise<{ job: JobRecord; warnings: InputIssue[] }>;
  captions(req: Pick<SlideshowCreateReqInput, 'templateId' | 'input'>): Promise<CaptionResult[]>;
  createFromPrompt(req: Omit<CreateFromPromptReq, 'target'> & { target?: CreateFromPromptReq['target'] }): Promise<{ job: JobRecord; director: DirectorInfo }>;
  runtimeStatus(): Promise<RuntimeStatus>;
  runtimeInstall(): Promise<RuntimeStatus>;
  jobsList(): Promise<JobRecord[]>;
  onJobChanged(listener: (job: JobRecord) => void): () => void;
  cancel(id: string): Promise<boolean>;
  retry(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  saveVideo(jobId: string, suggestedName?: string): Promise<string | null>;
  reveal(target: { jobId?: string; path?: string }): Promise<boolean>;
  copyText(text: string): Promise<void>;
  /** URL phát video của job đã xong (giao thức asset:// chỉ phục vụ tệp trong thư mục job của app). */
  videoUrl(job: Pick<JobRecord, 'id' | 'updatedAt'>): string;
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && typeof (window as { aps?: unknown }).aps === 'object' && (window as { aps?: unknown }).aps !== null;
}

export class IpcCreateService implements CreateService {
  available = () => true;
  profileGet = () => invoke('profile:get');
  profileSet = (patch: BusinessProfilePatch) => invoke('profile:set', patch);
  pick = async (kind: PickKind) => (await invoke('dialog:pickFile', { kind })).path;
  pathForFile = (file: File) => window.aps.pathForFile(file);
  thumbnail = async (path: string) => ({ dataUrl: (await invoke('photo:thumbnail', { path })).dataUrl });
  validate = (req: SlideshowCreateReqInput) => invoke('slideshow:validate', req);
  create = (req: SlideshowCreateReqInput) => invoke('slideshow:create', req);
  captions = (req: Pick<SlideshowCreateReqInput, 'templateId' | 'input'>) => invoke('slideshow:caption', req);
  createFromPrompt = (req: Parameters<CreateService['createFromPrompt']>[0]) => invoke('jobs:createFromPrompt', req);
  runtimeStatus = () => invoke('runtime:status');
  runtimeInstall = () => invoke('runtime:install');
  jobsList = () => invoke('jobs:list');
  onJobChanged = (listener: (job: JobRecord) => void) => subscribe('jobs:changed', listener);
  cancel = async (id: string) => (await invoke('jobs:cancel', { id })).ok;
  retry = async (id: string) => (await invoke('jobs:retry', { id })).ok;
  remove = async (id: string) => (await invoke('jobs:remove', { id })).ok;
  saveVideo = async (jobId: string, suggestedName?: string) => (await invoke('video:save', { jobId, ...(suggestedName ? { suggestedName } : {}) })).path;
  reveal = async (target: { jobId?: string; path?: string }) => (await invoke('video:reveal', target)).ok;
  copyText = async (text: string) => {
    await invoke('clipboard:writeText', { text });
  };
  videoUrl = (job: Pick<JobRecord, 'id' | 'updatedAt'>) => `asset://job/${job.id}/output?v=${job.updatedAt}`;
}

const unavailable = (): never => {
  throw Object.assign(new Error('NO_BRIDGE'), { code: 'NO_BRIDGE' });
};

/** Dùng khi mở giao diện ngoài Electron (trình duyệt/test thiếu cầu nối): màn hình hiện thông báo thay vì lỗi trắng trang. */
export class UnavailableCreateService implements CreateService {
  available = () => false;
  profileGet = async () => ({}) as BusinessProfile;
  profileSet = async () => ({}) as BusinessProfile;
  pick = async () => unavailable();
  pathForFile = () => '';
  thumbnail = async () => ({ dataUrl: null });
  validate = async () => unavailable();
  create = async () => unavailable();
  captions = async () => [];
  createFromPrompt = async () => unavailable();
  runtimeStatus = async () => unavailable();
  runtimeInstall = async () => unavailable();
  jobsList = async () => [];
  onJobChanged = () => () => undefined;
  cancel = async () => false;
  retry = async () => false;
  remove = async () => false;
  saveVideo = async () => unavailable();
  reveal = async () => false;
  copyText = async (text: string) => {
    await navigator.clipboard?.writeText(text);
  };
  videoUrl = () => '';
}
