import { BarChart3, Flag, Home, Layers, LogIn, Menu, Search, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Profile } from '../types/database';

interface Props {
  profile: Profile | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
  pendingInvitations: number;
  pendingOrganizerRequests: number;
}

type Item = { href: string; label: string; icon: LucideIcon; badge?: number; match?: (path: string) => boolean };

/**
 * Barra inferior en celular: las secciones principales a un toque, sin abrir el menú ☰.
 * En escritorio no se muestra (ahí está la barra superior completa).
 */
export const MobileTabBar = ({ profile, menuOpen, onToggleMenu, pendingInvitations, pendingOrganizerRequests }: Props) => {
  const path = window.location.pathname;
  const isOrganizer = profile?.role === 'admin_sistema' || profile?.role === 'admin_campeonato';

  const items: Item[] = [
    { href: '/', label: 'Inicio', icon: Home, match: (p) => p === '/' },
    { href: '/leagues', label: 'Ligas', icon: Layers, match: (p) => p === '/leagues' || p.startsWith('/league/') },
    { href: '/search', label: 'Buscar', icon: Search },
  ];
  if (!profile) {
    items.push({ href: '/organizar', label: 'Organiza', icon: Flag });
    items.push({ href: '/login', label: 'Entrar', icon: LogIn, match: (p) => p === '/login' || p === '/register' });
  } else if (isOrganizer) {
    items.push({
      href: pendingOrganizerRequests > 0 ? '/admin?tab=solicitudes' : '/admin',
      label: 'Administrar',
      icon: BarChart3,
      badge: pendingOrganizerRequests,
      match: (p) => p === '/admin',
    });
  } else {
    items.push({ href: '/my-teams', label: 'Mis equipos', icon: Users, badge: pendingInvitations });
  }

  const itemClass = (active: boolean) =>
    `relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 text-[11px] leading-tight font-bold ${
      active ? 'text-mg-pitch-deep' : 'text-mg-muted'
    }`;

  return (
    <nav
      aria-label="Navegación principal"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-mg-surface border-t border-mg-line shadow-[0_-4px_16px_rgba(12,26,46,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex">
        {items.map(({ href, label, icon: Icon, badge, match }) => {
          const active = match ? match(path) : path === href;
          return (
            <li key={label} className="flex-1 min-w-0 flex">
              <a href={href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                {active && <span className="absolute top-0 inset-x-4 h-[3px] rounded-b bg-mg-pitch" aria-hidden="true" />}
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {!!badge && badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-mg-gold text-mg-on-gold text-[10px] font-extrabold flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full">{label}</span>
                {!!badge && badge > 0 && <span className="sr-only"> ({badge} pendientes)</span>}
              </a>
            </li>
          );
        })}
        {profile && (
          <li className="flex-1 min-w-0 flex">
            <button type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-controls="mobile-menu" className={itemClass(menuOpen)}>
              {menuOpen ? <X className="h-[22px] w-[22px]" aria-hidden="true" /> : <Menu className="h-[22px] w-[22px]" aria-hidden="true" />}
              <span>Más</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
};
