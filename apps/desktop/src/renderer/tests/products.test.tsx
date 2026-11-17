// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

const cards = () => screen.queryAllByTestId('product-card');

describe('Sản phẩm', () => {
  it('hiển thị 6/8 sản phẩm, số lượng ở các tab và panel chi tiết của sản phẩm đầu tiên', async () => {
    renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    expect(screen.getByTestId('tab-all')).toHaveTextContent('8');
    expect(screen.getByTestId('tab-model3d')).toHaveTextContent('5');
    expect(screen.getByTestId('tab-imageOnly')).toHaveTextContent('3');
    expect(screen.getByTestId('pager-label')).toHaveTextContent('Hiển thị 6 / 8 sản phẩm');
    expect(await screen.findByTestId('detail-name')).toHaveTextContent('Serum dưỡng da');
    expect(screen.getByTestId('detail-size')).toHaveTextContent('60 × 60 × 146 mm');
  });

  it('lọc theo tab "Chỉ có ảnh" và "Có mô hình 3D"', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(screen.getByTestId('tab-imageOnly'));
    await waitFor(() => expect(cards()).toHaveLength(3));
    for (const b of screen.getAllByTestId('product-badge')) expect(b).toHaveTextContent('Chỉ có ảnh');
    await user.click(screen.getByTestId('tab-model3d'));
    await waitFor(() => expect(cards()).toHaveLength(5));
  });

  it('tìm kiếm không phân biệt dấu theo tên hoặc SKU', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.type(screen.getByTestId('product-search'), 'ca phe');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]).toHaveTextContent('Cà phê rang mộc');
    await user.clear(screen.getByTestId('product-search'));
    await user.type(screen.getByTestId('product-search'), 'bot-00');
    await waitFor(() => expect(cards()).toHaveLength(4));
  });

  it('chọn thẻ cập nhật panel chi tiết; sản phẩm chỉ có ảnh hiển thị ghi chú', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(cards()[2]!);
    await waitFor(() => expect(screen.getByTestId('detail-name')).toHaveTextContent('Hộp quà chăm sóc da'));
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Chỉ có ảnh');
    expect(cards()[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('phân trang sang trang 2 và chuyển dạng danh sách', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByTestId('pager-label')).toHaveTextContent('Hiển thị 2 / 8 sản phẩm');
    await user.click(screen.getByTestId('view-list'));
    expect(screen.getByTestId('product-list')).toHaveAttribute('data-view', 'list');
  });

  it('thêm sản phẩm mới qua hộp thoại và sửa sản phẩm', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(screen.getByTestId('add-product'));
    const modal = await screen.findByTestId('product-form-modal');
    expect(within(modal).getByTestId('product-form-submit')).toBeDisabled();
    await user.type(within(modal).getByTestId('product-name'), 'Son dưỡng môi');
    await user.type(within(modal).getByTestId('product-sku'), 'BOT-009');
    await user.click(within(modal).getByTestId('product-form-submit'));
    await waitFor(() => expect(screen.queryByTestId('product-form-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('tab-all')).toHaveTextContent('9'));
    await waitFor(() => expect(screen.getByTestId('detail-name')).toHaveTextContent('Son dưỡng môi'));

    await user.click(screen.getByTestId('edit-product'));
    const edit = await screen.findByTestId('product-form-modal');
    const name = within(edit).getByTestId('product-name');
    await user.clear(name);
    await user.type(name, 'Son bóng');
    await user.click(within(edit).getByTestId('product-form-submit'));
    await waitFor(() => expect(screen.getByTestId('detail-name')).toHaveTextContent('Son bóng'));
  });

  it('"Tạo nội dung" mở Studio với đúng sản phẩm', async () => {
    const { user } = renderApp('#/products');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(within(cards()[1]!).getByTestId('create-content'));
    await waitFor(() => expect(window.location.hash).toBe('#/studio?product=bot-002'));
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    expect(screen.getByTestId('studio-product-name')).toHaveTextContent('Kem dưỡng ban đêm');
  });
});
