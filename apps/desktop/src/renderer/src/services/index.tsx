import { createContext, useContext, type ReactNode } from 'react';
import { MockExportService, QueueExportService } from './export';
import { MockDirectorService } from './mock/director';
import { MockFileService } from './mock/files';
import { MockPublishService } from './mock/publish';
import { MockLibraryRepository, MockProductRepository, MockTemplateRepository, MockWorkspaceService } from './mock/repositories';
import { createIpcQueueBridge, hasIpcBridge } from './queueBridge';
import type { Services } from './types';

export interface CreateServicesOptions {
  /** true: nối nút Xuất tới IPC job queue (khi có window.aps). Mặc định tự phát hiện. */
  useQueue?: boolean;
  exportTickMs?: number;
}

/** Điểm duy nhất lắp ráp dịch vụ; thay lớp mock bằng SQLite/API tại đây. */
export function createServices(options: CreateServicesOptions = {}): Services {
  const library = new MockLibraryRepository();
  const mockExport = new MockExportService(library, { tickMs: options.exportTickMs });
  const useQueue = options.useQueue ?? hasIpcBridge();
  return {
    workspaces: new MockWorkspaceService(),
    products: new MockProductRepository(),
    templates: new MockTemplateRepository(),
    library,
    files: new MockFileService(),
    director: new MockDirectorService(),
    exporter: useQueue ? new QueueExportService(library, createIpcQueueBridge(), mockExport) : mockExport,
    publish: new MockPublishService(),
  };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesProvider missing');
  return s;
}

export type * from './types';
