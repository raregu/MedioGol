import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crown, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { formatPlanDate } from '../../hooks/useOrganizerPlan';

interface OrganizerRow {
  user_id: string;
  full_name: string | null;
  plan: 'free' | 'premium';
  premium_until: string | null;
  trial_ends_at: string | null;
  locked: boolean;
  leagues: number;
  sheets_used: number;
  sheet_limit: number | null;
  created_at: string | null;
  total: number;
}

const PAGE = 20;

/** Administrar (admin del sistema) → Organizadores: plan de cada organizador y activación manual de Premium. */
export const OrganizerPlansPanel = () => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<OrganizerRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [until, setUntil] = useState<Record<string, string>>({});
  const [confirmFree, setConfirmFree] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const req = useRef(0);

  // Búsqueda con espera corta para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++req.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const { data, error } = await supabase.rpc('admin_list_organizers', { p_search: query || null, p_limit: PAGE, p_offset: page * PAGE });
    if (id !== req.current) return;
    if (error) {
      console.error('admin_list_organizers', error);
      setStatus('error');
      return;
    }
    setRows((data || []) as OrganizerRow[]);
    setStatus('ready');
  }, [query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setPlan = async (row: OrganizerRow, plan: 'free' | 'premium') => {
    setBusy(row.user_id);
    setMessage(null);
    const date = until[row.user_id];
    const { error } = await supabase.rpc('admin_set_organizer_plan', {
      p_user: row.user_id,
      p_plan: plan,
      p_premium_until: plan === 'premium' && date ? new Date(`${date}T23:59:59`).toISOString() : null,
    });
    setBusy(null);
    setConfirmFree(null);
    if (error) {
      setMessage(error.message || 'No se pudo cambiar el plan.');
      return;
    }
    setMessage(`${row.full_name || 'Organizador'}: plan ${plan === 'premium' ? 'Premium activado' : 'Gratis'}.`);
    load();
  };

  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section aria-labelledby="plans-title" className="space-y-4 font-sans text-mg-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="plans-title" className="text-xl font-extrabold">Organizadores y planes</h2>
          <p className="text-sm text-mg-muted">Plan Gratis: 1 liga, 6 meses desde que la crea y 5 papeletas de prueba. Premium: sin límites (por ahora se activa aquí).</p>
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar organizador</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mg-muted" aria-hidden="true" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre" className={`${fieldClass} pl-9`} />
        </label>
      </div>

      {message && (
        <p role="status" className="rounded-mg-md bg-mg-pitch-tint px-4 py-2 text-sm font-semibold">
          {message}
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-mg-md bg-mg-danger-tint px-4 py-3">
          <p className="font-semibold text-sm">No se pudieron cargar los organizadores.</p>
          <button type="button" onClick={load} className={secondaryBtn}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {status === 'loading' && <p role="status" className="py-8 text-center text-mg-muted">Cargando…</p>}

      {status === 'ready' && rows.length === 0 && <p className="py-8 text-center text-mg-muted">No hay organizadores{query ? ' con ese nombre' : ''}.</p>}

      {status === 'ready' && rows.length > 0 && (
        <ul className="divide-y divide-mg-line rounded-mg-lg border border-mg-line bg-mg-surface">
          {rows.map((r) => (
            <li key={r.user_id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-[14rem]">
                <p className="font-bold">
                  {r.full_name || 'Sin nombre'}{' '}
                  {r.plan === 'premium' ? (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-mg-pitch-tint px-2 py-0.5 text-xs font-extrabold text-mg-pitch-deep">
                      <Crown className="h-3 w-3" aria-hidden="true" /> Premium
                    </span>
                  ) : r.locked ? (
                    <span className="ml-1 rounded-full bg-mg-danger-tint px-2 py-0.5 text-xs font-extrabold text-mg-danger">Gratis vencido · solo lectura</span>
                  ) : (
                    <span className="ml-1 rounded-full bg-mg-surface-2 px-2 py-0.5 text-xs font-extrabold">Gratis</span>
                  )}
                </p>
                <p className="text-xs text-mg-muted">
                  {r.leagues} {r.leagues === 1 ? 'liga' : 'ligas'} · papeletas leídas: {r.sheets_used}
                  {r.sheet_limit !== null ? ` de ${r.sheet_limit}` : ''}
                  {r.plan === 'premium' && r.premium_until ? ` · Premium hasta el ${formatPlanDate(r.premium_until)}` : ''}
                  {r.plan === 'free' && r.trial_ends_at ? ` · gratis hasta el ${formatPlanDate(r.trial_ends_at)}` : ''}
                  {r.plan === 'free' && !r.trial_ends_at ? ' · aún no crea su liga' : ''}
                </p>
              </div>
              {r.plan === 'free' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-mg-muted">
                    Hasta (opcional)
                    <input
                      type="date"
                      value={until[r.user_id] || ''}
                      onChange={(e) => setUntil((u) => ({ ...u, [r.user_id]: e.target.value }))}
                      className={`${fieldClass} mt-0.5 w-40`}
                    />
                  </label>
                  <button type="button" disabled={busy === r.user_id} onClick={() => setPlan(r, 'premium')} className={primaryBtn}>
                    <Crown className="h-4 w-4" aria-hidden="true" /> Activar Premium
                  </button>
                </div>
              ) : confirmFree === r.user_id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">¿Volver a Gratis? Se aplican los límites.</span>
                  <button type="button" disabled={busy === r.user_id} onClick={() => setPlan(r, 'free')} className={primaryBtn}>
                    Sí, volver a Gratis
                  </button>
                  <button type="button" onClick={() => setConfirmFree(null)} className={secondaryBtn}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmFree(r.user_id)} className={secondaryBtn}>
                  Volver a Gratis
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && total > PAGE && (
        <nav aria-label="Páginas" className="flex items-center justify-between">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className={secondaryBtn}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
          </button>
          <span className="text-sm text-mg-muted">
            Página {page + 1} de {pages}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className={secondaryBtn}>
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
};
