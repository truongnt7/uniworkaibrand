import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, dialog, ipcMain, net, protocol, session, shell } from 'electron';
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
  };
}

async function pickFile(kind: 'glb' | 'image' | 'runtime'): Promise<string | null> {
  // Hook cho e2e tự động (không thể điều khiển hộp thoại hệ điều hành): APS_E2E_FILES='{"glb":"...","image":"..."}'
  if (process.env.APS_E2E_FILES && (!app.isPackaged || process.env.APS_E2E === '1')) {
    const map = JSON.parse(process.env.APS_E2E_FILES) as Record<string, string>;
    return map[kind] ?? null;
  }
  const filters = {
    glb: [{ name: 'Model 3D (.glb)', extensions: ['glb'] }],
    image: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg'] }],
    runtime: [{ name: 'Blender runtime', extensions: ['xz', 'zip', 'dmg'] }],
  }[kind];
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return res.canceled ? null : (res.filePaths[0] ?? null);
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
    'dialog:pickFile': async ({ kind }) => ({ path: await pickFile(kind) }),
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
