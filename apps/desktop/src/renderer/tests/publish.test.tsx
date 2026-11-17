// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublishService } from '../src/services/types';
import { MockPublishService } from '../src/services/mock/publish';
import { renderApp } from './helpers';

const open = async (hash = '#/publish', overrides = {}) => {
  const utils = renderApp(hash, overrides);
  await waitFor(() => expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).not.toBe(''));
  return utils;
};

describe('Chuẩn bị đăng thủ công', () => {
  it('chọn sẵn video đã xuất xong, 2 kênh đã kết nối, TikTok chưa cấp quyền', async () => {
    await open();
    expect(screen.getByTestId('selected-name')).toHaveTextContent('Serum_Xoay360.mp4');
    expect(screen.getByTestId('channel-facebook')).toBeChecked();
    expect(screen.getByTestId('channel-instagram')).toBeChecked();
    expect(screen.queryByTestId('channel-tiktok')).not.toBeInTheDocument();
    expect(screen.getByTestId('channels')).toHaveTextContent('Chưa cấp quyền đăng');
    expect(screen.getByTestId('chosen-count')).toHaveTextContent('Đã chọn 2 kênh');
    expect(screen.getByTestId('v1-note')).toHaveTextContent('V1');
  });

  it('đếm ký tự theo giới hạn kênh và sửa caption', async () => {
    const { user } = await open();
    const input = screen.getByTestId('caption-input');
    await user.clear(input);
    await user.type(input, 'Xin chào');
    expect(screen.getByTestId('caption-counter')).toHaveTextContent('8 / 5.000');
    await user.click(within(screen.getAllByRole('tablist')[0]!).getByTestId('tab-instagram'));
    expect(screen.getByTestId('caption-counter')).toHaveTextContent('/ 2.200');
  });

  it('thêm/xóa hashtag', async () => {
    const { user } = await open();
    const before = screen.getAllByTestId('hashtag').length;
    await user.type(screen.getByTestId('hashtag-input'), 'khuyenmai{Enter}');
    expect(screen.getAllByTestId('hashtag')).toHaveLength(before + 1);
    expect(screen.getByTestId('hashtags')).toHaveTextContent('#khuyenmai');
    await user.click(screen.getByRole('button', { name: 'Xóa #khuyenmai' }));
    expect(screen.getAllByTestId('hashtag')).toHaveLength(before);
  });

  it('xem trước theo kênh phản ánh caption đang sửa', async () => {
    const { user } = await open();
    const preview = screen.getByTestId('post-preview');
    expect(preview).toHaveAttribute('data-channel', 'instagram');
    await user.click(within(screen.getAllByRole('tablist')[1]!).getByTestId('tab-facebook'));
    expect(screen.getByTestId('post-preview')).toHaveAttribute('data-channel', 'facebook');
    expect(screen.getByTestId('post-caption')).toHaveTextContent('Chạm vào thiên nhiên, nâng niu làn da');
  });

  it('"AI viết caption" tạo lại caption mặc định', async () => {
    const { user } = await open();
    const input = screen.getByTestId('caption-input');
    await user.clear(input);
    expect(input).toHaveValue('');
    await user.click(screen.getByTestId('ai-caption'));
    await waitFor(() => expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).toContain('BOTANIC'));
  });

  it('sao chép caption + hashtag qua dịch vụ publish', async () => {
    const real = new MockPublishService();
    const publish: PublishService = {
      channels: () => real.channels(),
      suggestCaption: (i, c) => real.suggestCaption(i, c),
      copyToClipboard: vi.fn(async () => undefined),
    };
    const { user } = await open('#/publish', { publish });
    await user.click(screen.getByTestId('copy-caption'));
    await waitFor(() => expect(publish.copyToClipboard).toHaveBeenCalledTimes(1));
    const text = vi.mocked(publish.copyToClipboard).mock.calls[0]![0];
    expect(text).toContain('Chạm vào thiên nhiên');
    expect(text).toContain('#BOTANIC');
    expect(await screen.findByTestId('toast')).toHaveTextContent('Đã sao chép');
  });

  it('báo lỗi khi không sao chép được', async () => {
    const real = new MockPublishService();
    const publish: PublishService = {
      channels: () => real.channels(),
      suggestCaption: (i, c) => real.suggestCaption(i, c),
      copyToClipboard: vi.fn(async () => Promise.reject(new Error('CLIPBOARD_UNAVAILABLE'))),
    };
    const { user } = await open('#/publish', { publish });
    await user.click(screen.getByTestId('copy-caption'));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Không sao chép được');
  });

  it('đổi nội dung bằng hộp chọn và mở từ Thư viện với đúng mục', async () => {
    const { user } = await open();
    await user.click(screen.getByTestId('change-content'));
    const modal = await screen.findByTestId('choose-content-modal');
    expect(within(modal).queryByText('NuocHoa_CaoCap.mp4')).not.toBeInTheDocument();
    await user.click(within(modal).getAllByTestId('choose-item').find((i) => i.dataset.id === 'lib-001')!);
    await waitFor(() => expect(screen.getByTestId('selected-name')).toHaveTextContent('Serum_ThienNhien_01.png'));
    expect(screen.getByTestId('download-file')).toHaveTextContent('Tải ảnh');
  });
});
