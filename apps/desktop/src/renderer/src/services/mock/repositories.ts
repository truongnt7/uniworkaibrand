import type {
  LibraryCounts,
  LibraryFolder,
  LibraryItem,
  LibraryQuery,
  LibraryRepository,
  NewExport,
  Page,
  Product,
  ProductCounts,
  ProductDraft,
  ProductQuery,
  ProductRepository,
  Template,
  TemplateQuery,
  TemplateRepository,
  UserProfile,
  Workspace,
  WorkspaceService,
} from '../types';
import { FOLDERS, PRODUCTS, TEMPLATES, USER, WORKSPACES, seedLibrary } from './data';

function paginate<T>(all: T[], page = 1, pageSize = 6): Page<T> {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: all.slice((current - 1) * size, current * size), total: all.length, page: current, pageSize: size };
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const matches = (haystack: string[], needle: string | undefined) => {
  if (!needle?.trim()) return true;
  const n = norm(needle.trim());
  return haystack.some((h) => norm(h).includes(n));
};

const clone = <T>(v: T): T => structuredClone(v);

export class MockProductRepository implements ProductRepository {
  private items: Product[] = clone(PRODUCTS);

  async list(query: ProductQuery = {}): Promise<Page<Product>> {
    const { filter = 'all', search, category, brand, page, pageSize } = query;
    const filtered = this.items.filter((p) => {
      if (filter === 'model3d' && !p.hasModel3d) return false;
      if (filter === 'imageOnly' && p.hasModel3d) return false;
      if (category && p.category !== category) return false;
      if (brand && p.brand !== brand) return false;
      return matches([p.name, p.sku], search);
    });
    const res = paginate(filtered, page, pageSize);
    return { ...res, items: clone(res.items) };
  }

  async counts(): Promise<ProductCounts> {
    const model3d = this.items.filter((p) => p.hasModel3d).length;
    return { all: this.items.length, model3d, imageOnly: this.items.length - model3d };
  }

  async get(id: string): Promise<Product | null> {
    const p = this.items.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  async facets() {
    return {
      categories: [...new Set(this.items.map((p) => p.category))],
      brands: [...new Set(this.items.map((p) => p.brand))],
    };
  }

  async create(draft: ProductDraft): Promise<Product> {
    const n = this.items.length + 1;
    const product: Product = {
      id: `prd-${n}-${Date.now().toString(36)}`,
      sku: draft.sku,
      name: draft.name,
      brand: draft.brand,
      category: draft.category,
      hasModel3d: draft.hasModel3d ?? false,
      imageCount: 1,
      modelFile: draft.hasModel3d ? `${draft.sku.toLowerCase()}.glb` : null,
      labelFile: null,
      sizeMm: { width: 60, depth: 60, height: 100 },
      brandColors: clone(PRODUCTS[0]!.brandColors),
      createdImages: 0,
      createdVideos: 0,
      art: { product: 'serum', scene: 'studio' },
    };
    this.items = [product, ...this.items];
    return clone(product);
  }

  async update(id: string, patch: Partial<ProductDraft>): Promise<Product> {
    const idx = this.items.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error('PRODUCT_NOT_FOUND');
    const next = { ...this.items[idx]!, ...patch } as Product;
    this.items[idx] = next;
    return clone(next);
  }
}

export class MockTemplateRepository implements TemplateRepository {
  private items: Template[] = clone(TEMPLATES);

  async list(query: TemplateQuery = {}): Promise<Page<Template>> {
    const { tab = 'all', search, industry, aspect, style = 'all', page, pageSize } = query;
    const filtered = this.items.filter((t) => {
      if (tab === 'image' && t.kind !== 'image') return false;
      if (tab === 'video' && t.kind !== 'video') return false;
      if (tab === 'mine' && !t.saved) return false;
      if (industry && t.industry !== industry) return false;
      if (aspect && t.aspect !== aspect) return false;
      if (style !== 'all' && t.style !== style) return false;
      return matches([t.name, t.description, t.industry, t.suitableFor], search);
    });
    const res = paginate(filtered, page, pageSize);
    return { ...res, items: clone(res.items) };
  }

  async get(id: string) {
    const t = this.items.find((x) => x.id === id);
    return t ? clone(t) : null;
  }

  async industries() {
    return [...new Set(this.items.map((t) => t.industry))];
  }

  private patch(id: string, fn: (t: Template) => Template): Template {
    const idx = this.items.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('TEMPLATE_NOT_FOUND');
    const next = fn(this.items[idx]!);
    this.items[idx] = next;
    return clone(next);
  }

  async toggleFavorite(id: string) {
    return this.patch(id, (t) => ({ ...t, favorite: !t.favorite }));
  }

  async setSaved(id: string, saved: boolean) {
    return this.patch(id, (t) => ({ ...t, saved }));
  }

  async savedCount() {
    return this.items.filter((t) => t.saved).length;
  }
}

export class MockLibraryRepository implements LibraryRepository {
  private items: LibraryItem[];
  private folderList: LibraryFolder[] = clone(FOLDERS);
  private listeners = new Set<() => void>();

  constructor(now: number = Date.now()) {
    this.items = seedLibrary(now);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async list(query: LibraryQuery = {}): Promise<Page<LibraryItem>> {
    const { tab = 'all', search, productId, folderId, sort = 'newest', page, pageSize } = query;
    const filtered = this.items.filter((i) => {
      if (tab === 'image' && i.kind !== 'image') return false;
      if (tab === 'video' && i.kind !== 'video') return false;
      if (tab === 'favorite' && !i.favorite) return false;
      if (productId && i.productId !== productId) return false;
      if (folderId && i.folderId !== folderId) return false;
      return matches([i.name, i.productName, ...i.tags], search);
    });
    filtered.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    );
    const res = paginate(filtered, page, pageSize);
    return { ...res, items: clone(res.items) };
  }

  async counts(): Promise<LibraryCounts> {
    return {
      all: this.items.length,
      image: this.items.filter((i) => i.kind === 'image').length,
      video: this.items.filter((i) => i.kind === 'video').length,
      favorite: this.items.filter((i) => i.favorite).length,
    };
  }

  async get(id: string) {
    const i = this.items.find((x) => x.id === id);
    return i ? clone(i) : null;
  }

  async folders() {
    return clone(this.folderList);
  }

  async createFolder(name: string) {
    const folder = { id: `fd-${Date.now().toString(36)}`, name: name.trim() };
    this.folderList = [...this.folderList, folder];
    this.emit();
    return clone(folder);
  }

  private patch(id: string, fn: (i: LibraryItem) => LibraryItem): LibraryItem {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error('LIBRARY_ITEM_NOT_FOUND');
    const next = fn(this.items[idx]!);
    this.items[idx] = next;
    this.emit();
    return clone(next);
  }

  async rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('EMPTY_NAME');
    return this.patch(id, (i) => ({ ...i, name: trimmed }));
  }

  async move(id: string, folderId: string | null) {
    return this.patch(id, (i) => ({ ...i, folderId }));
  }

  async toggleFavorite(id: string) {
    return this.patch(id, (i) => ({ ...i, favorite: !i.favorite }));
  }

  async addExporting(input: NewExport): Promise<LibraryItem> {
    const video = input.kind === 'video';
    const item: LibraryItem = {
      id: `lib-${Date.now().toString(36)}-${this.items.length}`,
      name: input.name,
      kind: input.kind,
      productId: input.productId,
      productName: input.productName,
      format: video ? 'MP4' : 'PNG',
      width: input.width,
      height: input.height,
      durationS: input.durationS,
      sizeBytes: 0,
      version: 1,
      folderId: null,
      tags: [],
      status: 'exporting',
      progress: 0,
      favorite: false,
      createdAt: Date.now(),
      art: input.art,
      jobId: input.jobId ?? null,
    };
    this.items = [item, ...this.items];
    this.emit();
    return clone(item);
  }

  async updateExport(id: string, patch: { progress?: number; status?: LibraryItem['status'] }) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const cur = this.items[idx]!;
    const status = patch.status ?? cur.status;
    const progress = status === 'done' ? 1 : Math.min(1, Math.max(0, patch.progress ?? cur.progress));
    const sizeBytes =
      status === 'done' && cur.sizeBytes === 0 ? Math.round((cur.kind === 'video' ? 14 : 4) * 1024 * 1024) : cur.sizeBytes;
    return this.patch(id, (i) => ({ ...i, status, progress, sizeBytes }));
  }
}

export class MockWorkspaceService implements WorkspaceService {
  private currentId = WORKSPACES[0]!.id;

  async list(): Promise<Workspace[]> {
    return clone(WORKSPACES);
  }

  async current(): Promise<Workspace> {
    return clone(WORKSPACES.find((w) => w.id === this.currentId) ?? WORKSPACES[0]!);
  }

  async setCurrent(id: string): Promise<Workspace> {
    const ws = WORKSPACES.find((w) => w.id === id);
    if (!ws) throw new Error('WORKSPACE_NOT_FOUND');
    this.currentId = id;
    return clone(ws);
  }

  async user(): Promise<UserProfile> {
    return clone(USER);
  }
}
