import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@aps/i18n';
import { setLocale } from '../i18n';
import { useServices } from '../services';
import type { UserProfile, Workspace } from '../services/types';
import { useAsync } from '../hooks';
import { Check, ChevronDown, CircleQuestionMark, Clapperboard, ImageIcon, LayoutDashboard, Layers, Package, Send, Sparkles } from '../ui/Icon';
import { navigate, useRoute, type RoutePath } from './router';

interface NavItem {
  path: RoutePath;
  key: string;
  icon: typeof Package;
}

const NAV: NavItem[] = [
  { path: '/', key: 'overview', icon: LayoutDashboard },
  { path: '/products', key: 'products', icon: Package },
  { path: '/studio', key: 'studio', icon: Sparkles },
  { path: '/templates', key: 'templates', icon: Layers },
  { path: '/library', key: 'library', icon: ImageIcon },
  { path: '/publish', key: 'publish', icon: Send },
];

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { workspaces } = useServices();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => workspaces.list(), [workspaces]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  useEffect(() => {
    void workspaces.current().then(setCurrent);
  }, [workspaces]);
  const ref = useOutsideClose(open, () => setOpen(false));

  const choose = async (id: string) => {
    setCurrent(await workspaces.setCurrent(id));
    setOpen(false);
  };

  return (
    <div className="ws" ref={ref}>
      <button
        type="button"
        className="ws-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('ui.workspace.switch')}
        data-testid="workspace-switcher"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ws-name">{current?.name ?? ''}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <ul className="menu" role="listbox" aria-label={t('ui.workspace.list')} data-testid="workspace-menu">
          {(list.data ?? []).map((w) => (
            <li key={w.id} role="option" aria-selected={w.id === current?.id}>
              <button type="button" className="menu-item" data-testid={`workspace-${w.id}`} onClick={() => void choose(w.id)}>
                <span>{w.name}</span>
                {w.id === current?.id ? <Check size={14} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const { t, i18n } = useTranslation();
  const { workspaces } = useServices();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  useEffect(() => {
    void workspaces.user().then(setUser);
  }, [workspaces]);
  const ref = useOutsideClose(open, () => setOpen(false));
  const initials = (user?.name ?? '').split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className="user" ref={ref}>
      <button type="button" className="user-trigger" aria-haspopup="menu" aria-expanded={open} data-testid="user-menu" onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden>
          {initials}
        </span>
        <span className="user-name">{user?.name ?? ''}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="menu menu-up" role="menu" data-testid="user-popover">
          <div className="menu-label">{t('ui.user.language')}</div>
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={i18n.language === l}
              className="menu-item"
              data-testid={`locale-${l}`}
              onClick={() => {
                setLocale(l as Locale);
                setOpen(false);
              }}
            >
              <span>{t(`locale.${l}`)}</span>
              {i18n.language === l ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const route = useRoute();

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">{t('app.title')}</span>
      </div>
      <WorkspaceSwitcher />
      <nav aria-label={t('ui.nav.label')} className="nav">
        {NAV.map(({ path, key, icon: Icon }) => (
          <a
            key={path}
            href={`#${path}`}
            className={`nav-item${route.path === path ? ' nav-active' : ''}`}
            aria-current={route.path === path ? 'page' : undefined}
            data-testid={`nav-${key}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(path);
            }}
          >
            <Icon size={17} />
            <span>{t(`ui.nav.${key}`)}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-foot">
        <a
          href="#/poc"
          className={`nav-item nav-dev${route.path === '/poc' ? ' nav-active' : ''}`}
          aria-current={route.path === '/poc' ? 'page' : undefined}
          data-testid="nav-poc"
          onClick={(e) => {
            e.preventDefault();
            navigate('/poc');
          }}
        >
          <Clapperboard size={16} />
          <span>{t('ui.nav.poc')}</span>
        </a>
        <button type="button" className="nav-item nav-help" data-testid="nav-help">
          <CircleQuestionMark size={16} />
          <span>{t('ui.nav.help')}</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
}

