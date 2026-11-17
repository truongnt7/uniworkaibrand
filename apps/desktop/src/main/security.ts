import type { IpcMainInvokeEvent } from 'electron';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: asset:",
  "media-src 'self' asset:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Chỉ chấp nhận IPC từ khung chính của chính cửa sổ app (không iframe, không URL lạ). */
export function isTrustedSender(event: Pick<IpcMainInvokeEvent, 'senderFrame' | 'sender'>, allowedPrefixes: string[]): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  return allowedPrefixes.some((p) => frame.url === p || frame.url.startsWith(p));
}

/** Chuỗi URL mà app tự nạp; mọi điều hướng khác bị chặn. */
export function isAllowedNavigation(url: string, allowedPrefixes: string[]): boolean {
  return allowedPrefixes.some((p) => url === p || url.startsWith(p));
}

/** Link ngoài chỉ mở qua allowlist https. */
const EXTERNAL_ALLOWLIST = ['https://www.blender.org/', 'https://download.blender.org/'];
export function isAllowedExternal(url: string): boolean {
  return EXTERNAL_ALLOWLIST.some((p) => url.startsWith(p));
}
