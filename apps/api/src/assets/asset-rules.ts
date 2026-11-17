import type { AssetKind } from '../database/entities';

const MB = 1024 * 1024;

export interface AssetRule {
  contentTypes: readonly string[];
  maxBytes: number;
  extensions: readonly string[];
}

/** Giới hạn loại/dung lượng theo từng loại asset (khớp mục 2.2: chỉ nhận glb + ảnh, không nhận .blend). */
export const ASSET_RULES: Record<AssetKind, AssetRule> = {
  photo: { contentTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 25 * MB, extensions: ['.jpg', '.jpeg', '.png', '.webp'] },
  glb: { contentTypes: ['model/gltf-binary'], maxBytes: 150 * MB, extensions: ['.glb'] },
  label: { contentTypes: ['image/png'], maxBytes: 15 * MB, extensions: ['.png'] },
  logo: { contentTypes: ['image/png', 'image/svg+xml'], maxBytes: 10 * MB, extensions: ['.png', '.svg'] },
  music: { contentTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4'], maxBytes: 50 * MB, extensions: ['.mp3', '.wav', '.m4a'] },
  prop: { contentTypes: ['model/gltf-binary'], maxBytes: 150 * MB, extensions: ['.glb'] },
};

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return cleaned || 'file';
}

export function buildAssetKey(workspaceId: string, productId: string, kind: AssetKind, assetId: string, filename: string): string {
  return `workspaces/${workspaceId}/products/${productId}/${kind}/${assetId}/${sanitizeFilename(filename)}`;
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.slice(i).toLowerCase();
}
