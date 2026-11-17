import type { CaptionDraft, Channel, ChannelAccount, LibraryItem, PublishService } from '../types';

const ACCOUNTS: ChannelAccount[] = [
  { id: 'facebook', name: 'BOTANIC Việt Nam', handle: 'botanic.vietnam', type: 'Fanpage', connected: true },
  { id: 'instagram', name: '@botanic.vn', handle: 'botanic.vn', type: 'Business', connected: true },
  { id: 'tiktok', name: '@botanic.vn', handle: 'botanic.vn', type: 'TikTok', connected: false },
];

const tag = (s: string) =>
  '#' +
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

/** Caption mock theo mẫu cố định; bản thật gọi AI Gateway với tham số ngôn ngữ. */
export class MockPublishService implements PublishService {
  async channels(): Promise<ChannelAccount[]> {
    return structuredClone(ACCOUNTS);
  }

  async suggestCaption(item: LibraryItem, channel: Channel): Promise<CaptionDraft> {
    const name = item.productName;
    const text =
      channel === 'facebook'
        ? `Chạm vào thiên nhiên, nâng niu làn da. Khám phá ${name} BOTANIC trong diện mạo mới. Đặt hàng ngay hôm nay để nhận ưu đãi.`
        : `Chạm vào thiên nhiên. ${name} BOTANIC trong diện mạo mới. Link đặt hàng ở bio.`;
    const hashtags = ['#BOTANIC', tag('Cham Soc Da'), tag(name)];
    return { text, hashtags: [...new Set(hashtags)] };
  }

  async copyToClipboard(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // rơi xuống phương án dự phòng bên dưới
      }
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    if (!ok) throw new Error('CLIPBOARD_UNAVAILABLE');
  }
}
