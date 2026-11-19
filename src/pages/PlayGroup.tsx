import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, MapPin, RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { JoinPanel } from '../components/playgroups/JoinPanel';
import { RosterPanel } from '../components/playgroups/RosterPanel';
import { RulesPanel } from '../components/playgroups/RulesPanel';
import { TeamsPanel } from '../components/playgroups/TeamsPanel';
import { WeekPanel } from '../components/playgroups/WeekPanel';
import { primaryBtn } from '../components/payments/PaymentsUi';
import { useAuth } from '../contexts/AuthContext';
import { usePlayGroup } from '../hooks/usePlayGroups';
import { fmtSession } from '../utils/playGroups';

type Tab = 'semana' | 'equipos' | 'plantel' | 'reglas';
const TABS: { id: Tab; label: string }[] = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'plantel', label: 'Plantel' },
  { id: 'reglas', label: 'Reglas' },
];

/** /grupos/:id (miembros y organizador) y /g/:code (link de WhatsApp, con o sin cuenta). */
export const PlayGroup = () => {
  const { user, loading: authLoading } = useAuth();
  const route = useMemo(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'g' ? { code: parts[1] || null, id: null } : { id: parts[1] || null, code: null };
  }, []);
  const { view, status, reload, call, token, setToken } = usePlayGroup(route);
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab') as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : params.get('nuevo') ? 'plantel' : 'semana';
  });
  const [justCreated] = useState(() => params.get('nuevo') === '1');

  useEffect(() => {
    if (view) document.title = `${view.group.name} · MedioGol`;
  }, [view]);

  // Al abrir por id sin sesión: mandar a iniciar sesión
  useEffect(() => {
    if (!authLoading && !user && route.id && status === 'forbidden') window.location.href = '/login';
  }, [authLoading, user, route.id, status]);

  const pickTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    url.searchParams.delete('nuevo');
    window.history.replaceState({}, '', url.toString());
  };

  if (status === 'loading' || (status === 'forbidden' && !user && route.id)) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]" role="status">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-hidden="true" />
          <span className="sr-only">Cargando el grupo…</span>
        </div>
      </Layout>
    );
  }

  if (status !== 'ready' || !view) {
    const text = {
      missing: 'Los grupos fijos se están activando. Vuelve a intentar en un rato.',
      forbidden: 'No perteneces a este grupo. Pídele al organizador el link de WhatsApp.',
      notfound: 'Este grupo no existe o el link cambió.',
      error: 'No pudimos cargar el grupo. Revisa tu conexión.',
    }[status as 'missing' | 'forbidden' | 'notfound' | 'error'];
    return (
      <Layout>
        <div role="alert" className="max-w-xl mx-auto mt-10 rounded-mg-lg border border-mg-line bg-mg-surface p-6 text-center space-y-4 font-sans text-mg-ink">
          <p className="font-bold">{text}</p>
          {status === 'error' && (
            <button type="button" className={primaryBtn} onClick={reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
            </button>
          )}
        </div>
      </Layout>
    );
  }

  const { group, session, is_admin: admin } = view;
  const tabs = admin ? TABS : [];
  const needsJoin = !view.me && !admin;
  const panelProps = { view, call, token };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto font-sans text-mg-ink -mt-2">
        <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg px-4 pt-4 pb-5 space-y-1">
          {user && (
            <a href="/grupos" className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted min-h-[32px]">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Mis grupos
            </a>
          )}
          <p className="mg-label text-mg-gold">
            {group.name}
            {view.me && view.members.find((m) => m.id === view.me)?.role === 'fixed' ? ' · eres fijo' : ''}
            {admin ? ' · organizas' : ''}
          </p>
          <h1 className="font-display text-4xl leading-10 font-extrabold uppercase">{fmtSession(session.starts_at)}</h1>
          <p className="text-sm font-semibold text-mg-on-navy-muted flex items-center gap-1 flex-wrap">
            {session.venue && (<><MapPin className="h-4 w-4" aria-hidden="true" /> {session.venue} ·</>)} {session.used}/{session.slots} van
          </p>
        </header>

        {tabs.length > 0 && (
          <nav aria-label="Secciones del grupo" className="mt-3 -mx-1 overflow-x-auto">
            <ul className="flex gap-1 px-1">
              {tabs.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => pickTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                    className={`min-h-[44px] px-4 rounded-full text-sm font-extrabold whitespace-nowrap ${tab === t.id ? 'bg-mg-ink text-mg-surface' : 'bg-mg-surface-2 text-mg-ink'}`}>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-4 space-y-4">
          {justCreated && admin && tab === 'plantel' && (
            <p role="status" className="rounded-mg-lg bg-mg-pitch-tint text-mg-pitch-deep font-bold p-3 text-sm">
              Grupo creado. Agrega a los fijos aquí y después comparte el link en «Esta semana».
            </p>
          )}
          {needsJoin ? (
            <JoinPanel view={view} onJoined={(t) => { if (t) setToken(t); reload(); }} />
          ) : (
            <>
              {(!admin || tab === 'semana') && <WeekPanel {...panelProps} />}
              {(!admin || tab === 'equipos') && <TeamsPanel key={session.id} {...panelProps} />}
              {admin && tab === 'plantel' && <RosterPanel {...panelProps} />}
              {admin && tab === 'reglas' && <RulesPanel key={group.id} {...panelProps} />}
            </>
          )}
          {!user && view.me && (
            <p className="text-xs text-mg-muted text-center">
              Tu nombre quedó guardado en este teléfono. <a href="/register" className="font-bold text-mg-pitch-deep underline">Crea tu cuenta</a> para ver tus partidos en el Inicio.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
};
