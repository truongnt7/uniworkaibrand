import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MockArt } from '../../art/MockArt';
import type { FileService, LibraryItem } from '../types';

export type SaveBlob = (blob: Blob, fileName: string) => void;

const saveWithAnchor: SaveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Mock: xuất ảnh minh hoạ SVG làm tệp giữ chỗ. Bản thật dùng IPC (hộp thoại lưu / mở thư mục chứa file). */
export class MockFileService implements FileService {
  constructor(private readonly save: SaveBlob = saveWithAnchor) {}

  async download(item: LibraryItem): Promise<{ fileName: string }> {
    const base = item.name.replace(/\.[^.]+$/, '');
    const fileName = `${base}.svg`;
    const svg = renderToStaticMarkup(createElement(MockArt, { art: item.art, width: 1024, height: 1024, standalone: true }));
    this.save(new Blob([svg], { type: 'image/svg+xml' }), fileName);
    return { fileName };
  }

  async revealInFolder(): Promise<void> {
    return;
  }
}
