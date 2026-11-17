import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { EVENT_CHANNEL_NAMES, INVOKE_CHANNEL_NAMES } from '@aps/shared/channels';
import type { ApsBridge } from './api';

const invokeAllow = new Set<string>(INVOKE_CHANNEL_NAMES);
const eventAllow = new Set<string>(EVENT_CHANNEL_NAMES);

const bridge: ApsBridge = {
  invoke(channel, payload) {
    if (!invokeAllow.has(channel)) return Promise.reject(new Error(`Kênh IPC không được phép: ${String(channel)}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel, listener) {
    if (!eventAllow.has(channel)) throw new Error(`Kênh sự kiện không được phép: ${String(channel)}`);
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  pathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('aps', bridge);
