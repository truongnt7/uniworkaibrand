import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryFolder } from '../../services/types';
import { Button, Modal } from '../../ui/kit';

export function RenameModal({ name, onSubmit, onClose }: { name: string; onSubmit: (name: string) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const valid = value.trim().length > 0;
  return (
    <Modal
      title={t('ui.library.renameTitle')}
      onClose={onClose}
      testId="rename-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('ui.common.cancel')}</Button>
          <Button variant="dark" disabled={!valid} onClick={() => void onSubmit(value)} data-testid="rename-submit">
            {t('ui.common.save')}
          </Button>
        </>
      }
    >
      <label className="field">
        <span>{t('ui.library.newName')}</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} data-testid="rename-input" autoFocus />
      </label>
    </Modal>
  );
}

export function MoveModal({
  folders,
  current,
  onSubmit,
  onClose,
}: {
  folders: LibraryFolder[];
  current: string | null;
  onSubmit: (folderId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(current);
  return (
    <Modal
      title={t('ui.library.moveTitle')}
      onClose={onClose}
      testId="move-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('ui.common.cancel')}</Button>
          <Button variant="dark" onClick={() => void onSubmit(value)} data-testid="move-submit">
            {t('ui.library.move')}
          </Button>
        </>
      }
    >
      <div className="radio-list" role="radiogroup" aria-label={t('ui.library.moveTitle')}>
        {[{ id: null, name: t('ui.library.noFolder') }, ...folders].map((f) => (
          <label key={f.id ?? 'none'} className="radio">
            <input type="radio" name="folder" checked={value === f.id} onChange={() => setValue(f.id)} data-testid={`move-${f.id ?? 'none'}`} />
            <span>{f.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export function FolderModal({ onSubmit, onClose }: { onSubmit: (name: string) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const valid = value.trim().length > 0;
  return (
    <Modal
      title={t('ui.library.newFolder')}
      onClose={onClose}
      testId="folder-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('ui.common.cancel')}</Button>
          <Button variant="dark" disabled={!valid} onClick={() => void onSubmit(value)} data-testid="folder-submit">
            {t('ui.library.createFolder')}
          </Button>
        </>
      }
    >
      <label className="field">
        <span>{t('ui.library.folderName')}</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} data-testid="folder-input" autoFocus />
      </label>
    </Modal>
  );
}
