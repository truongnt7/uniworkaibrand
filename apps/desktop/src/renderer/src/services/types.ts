import type { CreateService } from './create';

/**
 * Mô hình miền + interface dịch vụ cho UI shell.
 * Renderer chỉ phụ thuộc các interface này; bản mock (services/mock) sẽ được thay bằng SQLite/API sau.
 */

export type ArtProduct = 'serum' | 'jar' | 'box' | 'cleanser' | 'tin' | 'bag' | 'perfume' | 'can';
export type ArtScene = 'nature' | 'studio' | 'minimal' | 'luxury' | 'festive' | 'white' | 'beverage' | 'cafe';

/** Mô tả ảnh minh hoạ tự vẽ (SVG), thay bằng đường dẫn asset:// khi có dữ liệu thật. */
export interface ArtSpec {
  product: ArtProduct;
  scene: ArtScene;
}

export type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16';
export type ContentKind = 'image' | 'video';

export interface Workspace {
  id: string;
  name: string;
}

export interface UserProfile {
  name: string;
  email: string;
}

/* ---------------------------- Sản phẩm ---------------------------- */

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  hasModel3d: boolean;
  imageCount: number;
  modelFile: string | null;
  labelFile: string | null;
  sizeMm: { width: number; depth: number; height: number };
  brandColors: string[];
  createdImages: number;
  createdVideos: number;
  art: ArtSpec;
}

export type ProductFilter = 'all' | 'model3d' | 'imageOnly';

export interface ProductQuery {
  filter?: ProductFilter;
  search?: string;
  category?: string;
  brand?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductCounts {
  all: number;
  model3d: number;
  imageOnly: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ProductDraft = Pick<Product, 'name' | 'sku' | 'brand' | 'category'> & Partial<Pick<Product, 'hasModel3d'>>;

export interface ProductRepository {
  list(query?: ProductQuery): Promise<Page<Product>>;
  counts(): Promise<ProductCounts>;
  get(id: string): Promise<Product | null>;
  facets(): Promise<{ categories: string[]; brands: string[] }>;
  create(draft: ProductDraft): Promise<Product>;
  update(id: string, patch: Partial<ProductDraft>): Promise<Product>;
}

/* ---------------------------- Kho mẫu ---------------------------- */

export type TemplateStyle = 'minimal' | 'nature' | 'luxury' | 'festive' | 'white';
export type TemplateTab = 'all' | 'image' | 'video' | 'mine';
export type CustomizableKey = 'product' | 'background' | 'light' | 'props';

export interface Template {
  id: string;
  name: string;
  description: string;
  kind: ContentKind;
  durationS: number | null;
  industry: string;
  style: TemplateStyle;
  aspect: AspectRatio;
  suitableFor: string;
  customizable: CustomizableKey[];
  art: ArtSpec;
  favorite: boolean;
  saved: boolean;
}

export interface TemplateQuery {
  tab?: TemplateTab;
  search?: string;
  industry?: string;
  aspect?: AspectRatio | '';
  style?: TemplateStyle | 'all';
  page?: number;
  pageSize?: number;
}

export interface TemplateRepository {
  list(query?: TemplateQuery): Promise<Page<Template>>;
  get(id: string): Promise<Template | null>;
  industries(): Promise<string[]>;
  toggleFavorite(id: string): Promise<Template>;
  setSaved(id: string, saved: boolean): Promise<Template>;
  savedCount(): Promise<number>;
}

/* ---------------------------- Thư viện ---------------------------- */

export type LibraryTab = 'all' | 'image' | 'video' | 'favorite';
export type LibrarySort = 'newest' | 'oldest' | 'name';
export type LibraryStatus = 'done' | 'exporting' | 'failed';

export interface LibraryFolder {
  id: string;
  name: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  kind: ContentKind;
  productId: string;
  productName: string;
  format: 'PNG' | 'MP4';
  width: number;
  height: number;
  durationS: number | null;
  sizeBytes: number;
  version: number;
  folderId: string | null;
  tags: string[];
  status: LibraryStatus;
  progress: number;
  favorite: boolean;
  createdAt: number;
  art: ArtSpec;
  /** id job trong hàng đợi render thật (nếu có) */
  jobId?: string | null;
}

export interface LibraryQuery {
  tab?: LibraryTab;
  search?: string;
  productId?: string;
  folderId?: string | null;
  sort?: LibrarySort;
  page?: number;
  pageSize?: number;
}

export interface LibraryCounts {
  all: number;
  image: number;
  video: number;
  favorite: number;
}

export interface LibraryRepository {
  list(query?: LibraryQuery): Promise<Page<LibraryItem>>;
  counts(): Promise<LibraryCounts>;
  get(id: string): Promise<LibraryItem | null>;
  folders(): Promise<LibraryFolder[]>;
  createFolder(name: string): Promise<LibraryFolder>;
  rename(id: string, name: string): Promise<LibraryItem>;
  move(id: string, folderId: string | null): Promise<LibraryItem>;
  toggleFavorite(id: string): Promise<LibraryItem>;
  /** Tạo mục "Đang xuất" cho một lần xuất mới. */
  addExporting(input: NewExport): Promise<LibraryItem>;
  updateExport(id: string, patch: { progress?: number; status?: LibraryStatus }): Promise<LibraryItem | null>;
  /** Đăng ký nhận thay đổi (tiến độ xuất, đổi tên...). */
  subscribe(listener: () => void): () => void;
}

export interface NewExport {
  name: string;
  kind: ContentKind;
  productId: string;
  productName: string;
  width: number;
  height: number;
  durationS: number | null;
  art: ArtSpec;
  jobId?: string | null;
}

/** Tải tệp về máy (mock: tạo blob; thật: mở hộp thoại lưu qua IPC). */
export interface FileService {
  download(item: LibraryItem): Promise<{ fileName: string }>;
  revealInFolder(item: LibraryItem): Promise<void>;
}

/* ---------------------------- Studio ---------------------------- */

export type MotionPreset = 'spin360' | 'orbit' | 'dollyIn' | 'lift';
export type Easing = 'smooth' | 'linear' | 'easeIn' | 'easeOut';
export type SpeedPreset = 'slow' | 'normal' | 'fast';
export type TrackId = 'product' | 'camera' | 'logo';
export type SceneComponentId = 'product' | 'pedestal' | 'leaves' | 'logo';

export interface Clip {
  id: string;
  track: TrackId;
  /** nhãn kỹ thuật: spin360 | orbit | dolly_in | fade_in ... */
  kind: string;
  start: number;
  end: number;
  ease: Easing;
}

/** Timeline JSON là nguồn sự thật chung của UI và Đạo diễn AI (xem plan 3.2). */
export interface TimelineDoc {
  version: 1;
  aspect: AspectRatio;
  durationS: number;
  fps: number;
  motion: MotionPreset;
  speed: SpeedPreset;
  clips: Clip[];
  hidden: SceneComponentId[];
  lockLabel: boolean;
}

export interface ImageScene {
  preset: 'studio' | 'nature' | 'minimal' | 'luxury';
  backgroundColor: string;
  light: 'natural' | 'soft' | 'dramatic';
  camera: 'front' | 'angle' | 'top';
  shadow: number;
  aspect: AspectRatio;
  zoom: number;
  lockLabel: boolean;
  hidden: SceneComponentId[];
}

export interface DirectorResult {
  timeline: TimelineDoc;
  summary: string;
}

/** Đạo diễn AI: prompt -> timeline (mock theo từ khoá; thay bằng AI Gateway sau, luôn validate schema). */
export interface DirectorService {
  directVideo(prompt: string, current: TimelineDoc): Promise<DirectorResult>;
  directImage(prompt: string, current: ImageScene): Promise<{ scene: ImageScene; summary: string }>;
  suggestIdeas(): Promise<string[]>;
}

export interface ExportRequest {
  kind: ContentKind;
  product: Product;
  name: string;
  width: number;
  height: number;
  durationS: number | null;
  lockLabel: boolean;
  motion?: MotionPreset;
  scene?: ArtScene;
}

export type ExportMode = 'queue' | 'mock';

export interface ExportHandle {
  libraryItemId: string;
  mode: ExportMode;
}

/** Nối nút Xuất: IPC job queue nếu có runtime, ngược lại mô phỏng. */
export interface ExportService {
  start(request: ExportRequest): Promise<ExportHandle>;
}

/* ---------------------------- Đăng thủ công ---------------------------- */

export type Channel = 'facebook' | 'instagram';

export interface ChannelAccount {
  id: Channel | 'tiktok';
  name: string;
  handle: string;
  type: string;
  connected: boolean;
}

export interface CaptionDraft {
  text: string;
  hashtags: string[];
}

export interface PublishService {
  channels(): Promise<ChannelAccount[]>;
  suggestCaption(item: LibraryItem, channel: Channel): Promise<CaptionDraft>;
  copyToClipboard(text: string): Promise<void>;
}

/* ---------------------------- Tổng hợp ---------------------------- */

export interface WorkspaceService {
  list(): Promise<Workspace[]>;
  current(): Promise<Workspace>;
  setCurrent(id: string): Promise<Workspace>;
  user(): Promise<UserProfile>;
}

export interface Services {
  workspaces: WorkspaceService;
  products: ProductRepository;
  templates: TemplateRepository;
  library: LibraryRepository;
  files: FileService;
  director: DirectorService;
  exporter: ExportService;
  publish: PublishService;
  create: CreateService;
}
