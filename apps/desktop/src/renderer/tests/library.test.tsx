// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FileService } from '../src/services/types';
import { renderApp } from './helpers';

const cards = () => screen.queryAllByTestId('library-card');

describe('Thư viện', () => {
  it('hiển thị số lượng theo tab, nhóm Hôm nay/Trước đó và trạng thái "Đang xuất 68%"', async () => {
    renderApp('#/library');
    await waitFor(() => expect(cards()).toHaveLength(6));
    expect(screen.getByTestId('tab-all')).toHaveTextContent('24');
    expect(screen.getByTestId('tab-image')).toHaveTextContent('18');
    expect(screen.getByTestId('tab-video')).toHaveTextContent('6');
    expect(screen.getByTestId('group-today')).toBeInTheDocument();
    expect(screen.getByTestId('group-earlier')).toBeInTheDocument();
    expect(screen.getByTestId('exporting-badge')).toHaveTextContent('Đang xuất 68%');
    expect(screen.getByTestId('export-progress')).toHaveAttribute('aria-valuenow', '68');
    expect(screen.getByTestId('pager-label')).toHaveTextContent('Hiển thị 6 / 24 nội dung');
  });

  it('panel chi tiết hiển thị thông tin, thẻ và định dạng dung lượng theo locale', async () => {
    renderApp('#/library');
    expect(await screen.findByTestId('detail-file-name')).toHaveTextContent('Serum_ThienNhien_01.png');
    const panel = screen.getByTestId('library-detail');
    expect(within(panel).getByText('4,2 MB')).toBeInTheDocument();
    expect(within(panel).getByText('V2')).toBeInTheDocument();
    expect(within(panel).getByText('Mạng xã hội')).toBeInTheDocument();
    expect(screen.getByTestId('detail-folder')).toHaveTextContent('Chiến dịch BOTANIC');
  });

  it('mục đang xuất không cho tải xuống; mục hoàn tất gọi dịch vụ tải xuống', async () => {
    const files: FileService = { download: vi.fn(async (i) => ({ fileName: `${i.name}.svg` })), revealInFolder: vi.fn(async () => undefined) };
    const { user } = renderApp('#/library', { files });
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(await screen.findByTestId('download'));
    await waitFor(() => expect(files.download).toHaveBeenCalledTimes(1));
    expect(vi.mocked(files.download).mock.calls[0]![0].name).toBe('Serum_ThienNhien_01.png');
    expect(await screen.findByTestId('toast')).toHaveTextContent('Đã tải xuống');

    await user.click(cards().find((c) => c.dataset.status === 'exporting')!);
    await waitFor(() => expect(screen.getByTestId('detail-status')).toHaveTextContent('Đang xuất 68%'));
    expect(screen.getByTestId('download')).toBeDisabled();
  });

  it('lọc theo tab Video, thư mục và tìm kiếm', async () => {
    const { user } = renderApp('#/library');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(screen.getByTestId('tab-video'));
    await waitFor(() => expect(screen.getByTestId('pager-label')).toHaveTextContent('/ 6 nội dung'));
    await user.click(screen.getByTestId('tab-all'));
    const folder = screen.getAllByTestId('folder').find((f) => /Ra mắt/.test(f.textContent ?? ''))!;
    await user.click(folder);
    await waitFor(() => expect(screen.getByTestId('pager-label')).toHaveTextContent('/ 5 nội dung'));
    await user.click(screen.getByTestId('folder-all'));
    await user.type(screen.getByTestId('library-search'), 'xoay360');
    await waitFor(() => expect(cards()).toHaveLength(1));
  });

  it('đổi tên, di chuyển thư mục và tạo thư mục mới', async () => {
    const { user } = renderApp('#/library');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(await screen.findByTestId('rename'));
    const input = await screen.findByTestId('rename-input');
    await user.clear(input);
    await user.type(input, 'Serum_Final.png');
    await user.click(screen.getByTestId('rename-submit'));
    await waitFor(() => expect(screen.getByTestId('detail-file-name')).toHaveTextContent('Serum_Final.png'));

    await user.click(screen.getByTestId('move'));
    await user.click(await screen.findByTestId('move-fd-launch'));
    await user.click(screen.getByTestId('move-submit'));
    await waitFor(() => expect(screen.getByTestId('detail-folder')).toHaveTextContent('Ra mắt sản phẩm'));

    await user.click(screen.getByTestId('folder-new'));
    await user.type(await screen.findByTestId('folder-input'), 'Khuyến mãi');
    await user.click(screen.getByTestId('folder-submit'));
    await waitFor(() => expect(screen.getAllByTestId('folder').some((f) => f.textContent?.includes('Khuyến mãi'))).toBe(true));
  });

  it('xuất mới từ dịch vụ xuất hiện trong thư viện với tiến độ rồi hoàn tất', async () => {
    const { services } = renderApp('#/library');
    await waitFor(() => expect(cards()).toHaveLength(6));
    const product = (await services.products.get('bot-001'))!;
    const handle = await services.exporter.start({ kind: 'image', product, name: 'Mau_Moi', width: 1024, height: 1024, durationS: null, lockLabel: true });
    expect(handle.mode).toBe('mock');
    await waitFor(() => expect(screen.getByTestId('tab-all')).toHaveTextContent('25'));
    await waitFor(async () => expect((await services.library.get(handle.libraryItemId))?.status).toBe('done'), { timeout: 3000 });
  });
});
