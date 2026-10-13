import { useEffect, useRef, useState } from 'react';
import { Plus, Search as SearchIcon, Trophy, Users } from 'lucide-react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../utils/useDebounce';
import CreateBaseTeamModal from '../components/CreateBaseTeamModal';
import TeamHistoryModal from '../components/TeamHistoryModal';

const PAGE_SIZE = 24;

/** Fila de la RPC search_base_teams (supabase/migrations/20261013210000_teams_scalable.sql). */
interface TeamRow {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  status: string | null;
  founded_date: string | null;
  owner_id: string;
  owner_name: string | null;
  players_count: number;
  championships_count: number;
  total_count: number;
}

const fetchPage = (q: string, offset: number, signal: AbortSignal) =>
  supabase
    .rpc('search_base_teams', { p_query: q || null, p_limit: PAGE_SIZE, p_offset: offset })
    .abortSignal(signal);

/**
 * Directorio de equipos. Búsqueda y paginación en el servidor: nunca se descargan todos
 * los equipos, y los conteos de jugadores y campeonatos vienen en la misma consulta.
 */
export default function Teams() {
  const { user } = useAuth();
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const q = useDebounce(search.trim(), 300);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [historyTeam, setHistoryTeam] = useState<TeamRow | null>(null);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort();
    setStatus('loading');
    fetchPage(q, 0, controller.signal).then(({ data, error }) => {
      if (controller.signal.aborted) return;
      if (error) {
        console.error('Error loading teams:', error);
        setStatus('error');
        return;
      }
      const rows = (data || []) as TeamRow[];
      setTeams(rows);
      setTotal(rows.length ? Number(rows[0].total_count) : 0);
      setStatus('ready');
    });

    const url = new URL(window.location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());

    return () => controller.abort();
  }, [q, attempt]);

  const loadMore = async () => {
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    const { data, error } = await fetchPage(q, teams.length, controller.signal);
    if (controller.signal.aborted) return;
    setLoadingMore(false);
    if (error) {
      console.error('Error loading more teams:', error);
      return;
    }
    setTeams((prev) => [...prev, ...((data || []) as TeamRow[])]);
  };

  return (
    <Layout>
      <div className="space-y-6 font-sans text-mg-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[36px] leading-[38px] font-extrabold uppercase tracking-[0.01em]">Equipos</h1>
            <p className="text-mg-muted">Clubes y equipos de la plataforma, con su historial en campeonatos.</p>
          </div>
          {user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm hover:brightness-110"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear equipo
            </button>
          )}
        </div>

        <div className="relative max-w-2xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-mg-muted" aria-hidden="true" />
          <label htmlFor="team-search" className="sr-only">Buscar equipo</label>
          <input
            id="team-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca un equipo por su nombre"
            autoComplete="off"
            className="w-full h-12 pl-12 pr-4 rounded-full border border-mg-line-strong bg-mg-surface text-mg-ink font-semibold placeholder:text-mg-muted placeholder:font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-mg-focus"
          />
        </div>

        {status === 'loading' && (
          <div className="flex justify-center py-16" role="status">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-hidden="true" />
            <span className="sr-only">Cargando equipos…</span>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="bg-mg-danger-tint rounded-mg-lg px-5 py-6 flex flex-wrap items-center justify-between gap-4">
            <p className="font-semibold">No pudimos cargar los equipos. Revisa tu conexión.</p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm"
            >
              Reintentar
            </button>
          </div>
        )}

        {status === 'ready' && teams.length === 0 && (
          <div className="bg-mg-surface border border-mg-line rounded-mg-lg px-5 py-12 text-center">
            <Users className="h-10 w-10 mx-auto text-mg-muted mb-3" aria-hidden="true" />
            <p className="font-bold">{q ? `No hay equipos que coincidan con “${q}”.` : 'Aún no hay equipos.'}</p>
          </div>
        )}

        {status === 'ready' && teams.length > 0 && (
          <>
            <p className="text-sm text-mg-muted" aria-live="polite">
              {total} {total === 1 ? 'equipo' : 'equipos'}
            </p>
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {teams.map((team) => (
                <li
                  key={team.id}
                  className={`bg-mg-surface border border-mg-line rounded-mg-lg p-5 flex flex-col gap-4 hover:shadow-mg-card transition-shadow ${
                    team.status === 'inactive' ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {team.logo_url ? (
                      <img src={team.logo_url} alt="" loading="lazy" className="w-14 h-14 rounded-mg-md object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-mg-md mg-grass flex-shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[17px] leading-6 font-extrabold truncate">{team.name}</h2>
                      {team.owner_name && <p className="text-[13px] text-mg-muted truncate">Responsable: {team.owner_name}</p>}
                      {team.status === 'inactive' && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-mg-danger-tint text-mg-danger text-[11px] font-extrabold uppercase">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                  {team.description && <p className="text-sm text-mg-muted line-clamp-2">{team.description}</p>}
                  <dl className="flex gap-5 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-mg-muted" aria-hidden="true" />
                      <dt className="sr-only">Jugadores</dt>
                      <dd>
                        <span className="mg-num font-extrabold">{team.players_count}</span> jugadores
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-4 w-4 text-mg-muted" aria-hidden="true" />
                      <dt className="sr-only">Campeonatos</dt>
                      <dd>
                        <span className="mg-num font-extrabold">{team.championships_count}</span> campeonatos
                      </dd>
                    </div>
                  </dl>
                  <button
                    onClick={() => setHistoryTeam(team)}
                    className="mt-auto min-h-[44px] rounded-mg-md border border-mg-line-strong font-extrabold text-sm hover:bg-mg-surface-2"
                  >
                    Ver historial
                  </button>
                </li>
              ))}
            </ul>
            {teams.length < total && (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-h-[44px] px-6 rounded-mg-md border border-mg-line-strong font-extrabold text-sm hover:bg-mg-surface-2 disabled:opacity-50"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </button>
                <span className="text-xs text-mg-muted">
                  Mostrando {teams.length} de {total}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateBaseTeamModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setAttempt((a) => a + 1);
          }}
        />
      )}

      {historyTeam && (
        <TeamHistoryModal
          team={{ id: historyTeam.id, name: historyTeam.name, logo_url: historyTeam.logo_url ?? undefined, description: historyTeam.description ?? undefined }}
          onClose={() => setHistoryTeam(null)}
        />
      )}
    </Layout>
  );
}
