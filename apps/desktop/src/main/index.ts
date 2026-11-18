import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, clipboard, dialog, ipcMain, nativeImage, net, protocol, session, shell } from 'electron';
import {
  AppError,
  INVOKE_CHANNEL_NAMES,
  dispatchInvoke,
  type EventChannel,
  type EventPayload,
  type InvokeHandlers,
  type JobRecord,
} from '@aps/shared';
import type { OrchestratorConfig } from '../orchestrator/orchestrator';
import { OrchestratorClient } from './orchestratorClient';
import { CSP, isAllowedExternal, isAllowedNavigation, isTrustedSender } from './security';

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (process.env.APS_DATA_DIR) app.setPath('userData', resolve(process.env.APS_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();

const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? null;
const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
const repoRoot = resolve(app.getAppPath(), '..', '..');
const jobs = new Map<string, JobRecord>();
/** Phông Be Vietnam Pro Bold (SIL OFL 1.1) đi kèm app cho chữ trên video; xem THIRD_PARTY_NOTICES.md. */
const VIDEO_FONT = 'BeVietnamPro-Bold.ttf';
/** Tệp người dùng đã lưu qua hộp thoại, chỉ những đường dẫn này (và kết quả job) mới được mở trong thư mục. */
const savedPaths = new Set<string>();
const e2eQueues = new Map<string, string[]>();
let client: OrchestratorClient | null = null;
let mainWindow: BrowserWindow | null = null;

function rendererPrefixes(): string[] {
  return devServerUrl ? [devServerUrl] : [pathToFileURL(join(__dirname, '../renderer/')).toString()];
}

function broadcast<C extends EventChannel>(channel: C, payload: EventPayload<C>): void {
  if (channel === 'jobs:changed') jobs.set((payload as JobRecord).id, payload as JobRecord);
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

/** Bố cục tài nguyên: đóng gói -> <resources>/{blender-worker,keys/production,runtime-manifest.signed.json}; dev -> apps/desktop/resources + .dev-keys. */
function buildConfig(): OrchestratorConfig {
  const release = app.isPackaged;
  const workerScript = release ? join(process.resourcesPath, 'blender-worker', 'worker.py') : join(repoRoot, 'blender-worker', 'worker.py');
  const res = release ? process.resourcesPath : join(resourceRoot, 'resources');
  const devManifest = join(repoRoot, '.dev-keys', 'runtime-manifest.signed.json');
  const manifestPath = release
    ? join(res, 'runtime-manifest.signed.json')
    : (process.env.APS_MANIFEST_PATH ?? (existsSync(devManifest) ? devManifest : join(res, 'runtime-manifest.signed.json')));
  return {
    dataDir: app.getPath('userData'),
    workerScript,
    manifestPath,
    productionKeysDir: join(res, 'keys', 'production'),
    release,
    blenderOverride: release ? null : (process.env.APS_BLENDER_BIN ?? null),
    ffmpegOverride: release ? null : (process.env.APS_FFMPEG ?? null),
    fontPath: join(res, 'fonts', VIDEO_FONT),
    heicWorkerPath: join(__dirname, 'heicWorker.js'),
  };
}

const e2eHook = (): boolean => Boolean(process.env.APS_E2E_FILES) && (!app.isPackaged || process.env.APS_E2E === '1');

async function pickFile(kind: 'glb' | 'image' | 'runtime' | 'photo' | 'logo' | 'audio'): Promise<string | null> {
  // Hook cho e2e tự động (không thể điều khiển hộp thoại hệ điều hành): APS_E2E_FILES='{"glb":"...","photo":["a.jpg","b.jpg"]}'
  // (giá trị mảng được lấy lần lượt mỗi lần mở hộp thoại).
  if (e2eHook()) {
    const map = JSON.parse(process.env.APS_E2E_FILES as string) as Record<string, string | string[]>;
    const v = map[kind];
    if (Array.isArray(v)) {
      let q = e2eQueues.get(kind);
      if (!q) e2eQueues.set(kind, (q = [...v]));
      return q.shift() ?? null;
    }
    return v ?? null;
  }
  const filters = {
    glb: [{ name: 'Model 3D (.glb)', extensions: ['glb'] }],
    image: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg'] }],
    photo: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }],
    logo: [{ name: 'Logo', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    audio: [{ name: 'Nhạc', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }],
    runtime: [{ name: 'Blender runtime', extensions: ['xz', 'zip', 'dmg'] }],
  }[kind];
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return res.canceled ? null : (res.filePaths[0] ?? null);
}

const THUMB_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function thumbnail(path: string, maxSide: number): Promise<{ dataUrl: string | null; width: number | null; height: number | null }> {
  const none = { dataUrl: null, width: null, height: null };
  const ext = extname(path).toLowerCase();
  const mime = THUMB_EXT[ext];
  try {
    if (!mime || !statSync(path).isFile()) return none;
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) {
      // Chromium của Electron chưa giải mã được mọi ảnh WEBP qua nativeImage: gửi nguyên tệp nếu nhỏ.
      if (ext !== '.webp' || statSync(path).size > 6_000_000) return none;
      return { dataUrl: `data:image/webp;base64,${(await readFile(path)).toString('base64')}`, width: null, height: null };
    }
    const { width, height } = img.getSize();
    const k = Math.min(1, maxSide / Math.max(width, height));
    const small = k < 1 ? img.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }) : img;
    const data = ext === '.png' ? small.toPNG() : small.toJPEG(82);
    return { dataUrl: `data:${ext === '.png' ? 'image/png' : 'image/jpeg'};base64,${data.toString('base64')}`, width, height };
  } catch {
    return none;
  }
}

async function saveVideo(jobId: string, suggestedName?: string): Promise<string | null> {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'done' || !job.outputPath || !existsSync(job.outputPath)) throw new AppError('OUTPUT_MISSING', 'Chưa có video để lưu. Hãy tạo video trước.');
  const safe = (suggestedName ?? job.name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';
  const fileName = safe.toLowerCase().endsWith('.mp4') ? safe : `${safe}.mp4`;
  let dest: string | null;
  if (e2eHook() && process.env.APS_E2E_SAVE_DIR) {
    dest = join(process.env.APS_E2E_SAVE_DIR, fileName);
    await mkdir(process.env.APS_E2E_SAVE_DIR, { recursive: true });
  } else {
    const res = await dialog.showSaveDialog({ defaultPath: join(app.getPath('videos'), fileName), filters: [{ name: 'Video MP4', extensions: ['mp4'] }] });
    dest = res.canceled || !res.filePath ? null : res.filePath;
  }
  if (!dest) return null;
  if (!dest.toLowerCase().endsWith('.mp4')) dest = `${dest}.mp4`;
  await copyFile(job.outputPath, dest);
  savedPaths.add(resolve(dest));
  return dest;
}

function registerIpc(): void {
  const forward = (channel: string) => (req: unknown) => client!.invoke(channel, req);
  const handlers: InvokeHandlers = {
    'jobs:list': (async (req: unknown) => {
      const list = (await client!.invoke('jobs:list', req)) as JobRecord[];
      for (const j of list) jobs.set(j.id, j);
      return list;
    }) as never,
    'jobs:create': forward('jobs:create') as never,
    'jobs:createFromPrompt': forward('jobs:createFromPrompt') as never,
    'jobs:cancel': forward('jobs:cancel') as never,
    'jobs:retry': forward('jobs:retry') as never,
    'jobs:pause': forward('jobs:pause') as never,
    'jobs:resume': forward('jobs:resume') as never,
    'jobs:remove': forward('jobs:remove') as never,
    'runtime:status': forward('runtime:status') as never,
    'runtime:install': forward('runtime:install') as never,
    'runtime:importFile': forward('runtime:importFile') as never,
    'slideshow:validate': forward('slideshow:validate') as never,
    'slideshow:create': forward('slideshow:create') as never,
    'slideshow:caption': forward('slideshow:caption') as never,
    'profile:get': forward('profile:get') as never,
    'profile:set': forward('profile:set') as never,
    'dialog:pickFile': async ({ kind }) => ({ path: await pickFile(kind) }),
    'video:save': async ({ jobId, suggestedName }) => ({ path: await saveVideo(jobId, suggestedName) }),
    'video:reveal': ({ jobId, path }) => {
      const target = jobId ? jobs.get(jobId)?.outputPath : path && savedPaths.has(resolve(path)) ? path : null;
      if (!target || !existsSync(target)) return { ok: false };
      if (!e2eHook()) shell.showItemInFolder(target);
      return { ok: true };
    },
    'clipboard:writeText': ({ text }) => {
      clipboard.writeText(text);
      return { ok: true };
    },
    'photo:prepare': forward('photo:prepare') as never,
    'drafts:list': forward('drafts:list') as never,
    'drafts:get': forward('drafts:get') as never,
    'drafts:save': forward('drafts:save') as never,
    'drafts:remove': forward('drafts:remove') as never,
    'photo:thumbnail': async ({ path, maxSide }) => thumbnail(path, maxSide),
    'app:info': () => ({ version: app.getVersion(), platform: `${process.platform}-${process.arch}`, dataDir: app.getPath('userData') }),
  };
  for (const channel of INVOKE_CHANNEL_NAMES) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!isTrustedSender(event, rendererPrefixes())) throw new AppError('IPC_FORBIDDEN', 'sender không được tin cậy');
      return dispatchInvoke(handlers, channel, payload);
    });
  }
}

function registerAssetProtocol(): void {
  // asset://job/<id>/<output|poster|frame>: chỉ phục vụ file nằm trong thư mục job của app, không bao giờ đường dẫn tùy ý.
  protocol.handle('asset', async (request) => {
    const url = new URL(request.url);
    const [id, what] = url.pathname.split('/').filter(Boolean);
    const job = url.hostname === 'job' && id ? jobs.get(id) : undefined;
    let file: string | null = null;
    if (job?.workDir) {
      if (what === 'output' && job.outputPath) file = job.outputPath;
      else if (what === 'poster') file = join(job.workDir, 'frames', 'frame_000001.png');
    }
    const base = join(app.getPath('userData'), 'jobs');
    if (!file || relative(base, resolve(file)).startsWith('..') || !existsSync(file)) {
      return new Response('not found', { status: 404 });
    }
    const range = request.headers.get('range');
    return net.fetch(pathToFileURL(file).toString(), range ? { headers: { range } } : undefined);
  });
}

function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  if (!devServerUrl) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } });
    });
  }
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternal(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (e, url) => {
      if (!isAllowedNavigation(url, rendererPrefixes())) e.preventDefault();
    });
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'AI Product Studio',
    backgroundColor: '#14161a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  if (devServerUrl) void mainWindow.loadURL(devServerUrl);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  hardenSession();
  registerAssetProtocol();
  client = new OrchestratorClient(join(__dirname, 'orchestrator.js'), buildConfig(), broadcast);
  client.start();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !client) return;
  quitting = true;
  event.preventDefault();
  void client.stop().finally(() => app.exit(0));
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
