/** Danh sách kênh IPC (không phụ thuộc zod) để preload sandbox nhẹ; tests/ kiểm tra khớp với hợp đồng. */
export const INVOKE_CHANNEL_NAMES = [
  'jobs:list',
  'jobs:create',
  'jobs:cancel',
  'jobs:retry',
  'jobs:pause',
  'jobs:resume',
  'jobs:remove',
  'runtime:status',
  'runtime:install',
  'runtime:importFile',
  'dialog:pickFile',
  'app:info',
] as const;
export const EVENT_CHANNEL_NAMES = ['jobs:changed', 'runtime:progress'] as const;
export type InvokeChannelName = (typeof INVOKE_CHANNEL_NAMES)[number];
export type EventChannelName = (typeof EVENT_CHANNEL_NAMES)[number];
