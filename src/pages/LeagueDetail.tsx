import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Championship, League, LeagueAdjustment, LeaguePhase } from '../types/database';
import {
  buildClubs,
  buildEncounters,
  generalStandings,
  isFinished,
  LeagueMatchRow,
  LeagueTeamRow,
  RawTeamRow,
  seriesLabel,
  toLeagueTeam,
  seriesStandings,
} from '../utils/leagueStandings';
import { LeagueManageModal } from '../components/admin/LeagueManageModal';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Facebook,
  Globe,
  Layers,
  MapPin,
  Settings,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';

type Tab = 'general' | 'series' | 'fechas' | 'clubes';

const ClubLogo = ({ name, url, size = 'h-8 w-8' }: { name: string; url?: string | null; size?: string }) =>
  url ? (
    <img src={url} alt="" className={`${size} rounded-full object-cover border border-gray-200 flex-shrink-0 bg-white`} />
  ) : (
    <span className={`${size} rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0 border border-emerald-100`}>
      {name
        .split(/\s+/)
        .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')}
    </span>
  );

export const LeagueDetail = () => {
  const { profile } = useAuth();
  const leagueId = window.location.pathname.split('/').filter(Boolean).pop();
  const [league, setLeague] = useState<League | null>(null);
  const [series, setSeries] = useState<Championship[]>([]);
  const [teams, setTeams] = useState<LeagueTeamRow[]>([]);
  const [matches, setMatches] = useState<LeagueMatchRow[]>([]);
  const [phases, setPhases] = useState<LeaguePhase[]>([]);
  const [adjustments, setAdjustments] = useState<LeagueAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('general');
  const [phaseId, setPhaseId] = useState<string>('all');
  const [round, setRound] = useState<number | null>(null);
  const [showManage, setShowManage] = useState(false);

  const fetchData = async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const { data: leagueData } = await supabase.from('leagues').select('*').eq('id', leagueId).maybeSingle();
      setLeague(leagueData);
      if (!leagueData) return;

      const [{ data: champs }, { data: phaseData }, { data: adjData }] = await Promise.all([
        supabase.from('championships').select('*').eq('league_id', leagueId).order('display_order').order('name'),
        supabase.from('league_phases').select('*').eq('league_id', leagueId).order('display_order').order('round_from'),
        supabase.from('league_adjustments').select('*').eq('league_id', leagueId).order('applied_on'),
      ]);
      const seriesList = (champs || []) as Championship[];
      setSeries(seriesList);
      setPhases((phaseData || []) as LeaguePhase[]);
      setAdjustments((adjData || []) as LeagueAdjustment[]);

      const ids = seriesList.map((c) => c.id);
      if (ids.length) {
        const [{ data: teamData }, { data: matchData }] = await Promise.all([
          supabase.from('teams').select('id, championship_id, name, base_team_id, logo_url, base_team:base_teams(logo_url)').in('championship_id', ids),
          supabase
            .from('matches')
            .select('id, championship_id, home_team_id, away_team_id, match_date, round, home_score, away_score, status, venue')
            .in('championship_id', ids)
            .order('match_date'),
        ]);
        setTeams(((teamData || []) as RawTeamRow[]).map(toLeagueTeam));
        setMatches((matchData || []) as LeagueMatchRow[]);
      } else {
        setTeams([]);
        setMatches([]);
      }

      const ph = (phaseData || []) as LeaguePhase[];
      const def = ph.find((p) => p.is_default) || null;
      setPhaseId((prev) => (prev !== 'all' && ph.some((p) => p.id === prev) ? prev : def ? def.id : 'all'));
    } catch (error) {
      console.error('Error fetching league:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const canManage = !!profile && !!league && (profile.role === 'admin_sistema' || league.admin_id === profile.id);
  const phase = phases.find((p) => p.id === phaseId) || null;

  const general = useMemo(
    () => (league ? generalStandings(league, series, teams, matches, adjustments, phase) : []),
    [league, series, teams, matches, adjustments, phase]
  );

  const clubs = useMemo(() => buildClubs(teams), [teams]);
  const encounters = useMemo(() => buildEncounters(series, teams, matches), [series, teams, matches]);
  const rounds = useMemo(() => Array.from(new Set(encounters.map((e) => e.round))).sort((a, b) => a - b), [encounters]);

  // Fecha por defecto: la última con al menos un partido jugado (o la primera)
  useEffect(() => {
    if (round !== null || rounds.length === 0) return;
    const played = encounters.filter((e) => e.finishedCount > 0).map((e) => e.round);
    setRound(played.length ? Math.max(...played) : rounds[0]);
  }, [rounds, encounters, round]);

  const roundLabel = (r: number) => {
    const p = phases.find((x) => r >= x.round_from && r <= x.round_to);
    return p ? `${p.name} · Fecha ${r - p.round_from + 1}` : `Fecha ${r}`;
  };

  const pending = useMemo(() => {
    const now = Date.now();
    return encounters.filter((e) =>
      e.lines.some((l) => !isFinished(l.match) && l.match.status !== 'cancelled' && new Date(l.match.match_date).getTime() < now)
    );
  }, [encounters]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      </Layout>
    );
  }

  if (!league) {
    return (
      <Layout>
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Liga no encontrada</h2>
          <a href="/leagues" className="mt-4 inline-block px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            Ver ligas
          </a>
        </div>
      </Layout>
    );
  }

  const roundIdx = round !== null ? rounds.indexOf(round) : -1;
  const roundEncounters = encounters.filter((e) => e.round === round);
  const playingClubs = new Set(roundEncounters.flatMap((e) => [e.home.key, e.away.key]));
  const freeClubs = round !== null ? Array.from(clubs.values()).filter((c) => !playingClubs.has(c.key)) : [];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'Tabla General' },
    { id: 'series', label: 'Series' },
    { id: 'fechas', label: 'Fechas' },
    { id: 'clubes', label: 'Clubes' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <section className="bg-emerald-950 text-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 flex flex-wrap items-center gap-5">
            {league.logo_url ? (
              <img src={league.logo_url} alt="" className="h-20 w-20 rounded-full object-cover border-4 border-amber-400 bg-white" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-white text-emerald-900 flex items-center justify-center border-4 border-amber-400">
                <Trophy className="h-9 w-9" />
              </div>
            )}
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs font-bold tracking-widest uppercase text-emerald-300">
                Liga{league.season ? ` · Temporada ${league.season}` : ''}
              </p>
              <h1 className="text-3xl font-black leading-tight">{league.name}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-emerald-100">
                {league.location && (
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{league.location}</span>
                )}
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{clubs.size} clubes</span>
                <span className="flex items-center gap-1.5"><Layers className="h-4 w-4" />{series.length} series</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {league.facebook_page_url && (
                <a href={league.facebook_page_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-emerald-950 font-bold text-sm hover:bg-emerald-50">
                  <Facebook className="h-4 w-4" /> Facebook
                </a>
              )}
              {league.website_url && (
                <a href={league.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-emerald-950 font-bold text-sm hover:bg-emerald-50">
                  <Globe className="h-4 w-4" /> Sitio web
                </a>
              )}
              {canManage && (
                <button onClick={() => setShowManage(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400 text-amber-950 font-bold text-sm hover:bg-amber-300">
                  <Settings className="h-4 w-4" /> Administrar liga
                </button>
              )}
            </div>
          </div>
          <nav className="px-4 flex flex-wrap gap-1 border-t border-white/10" aria-label="Secciones de la liga">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-bold border-b-4 transition-colors ${
                  tab === t.id ? 'border-amber-400 text-white' : 'border-transparent text-emerald-200 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </section>

        {series.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            Esta liga aún no tiene series.{canManage && ' Usa "Administrar liga" para agregar los campeonatos que forman parte de ella.'}
          </div>
        )}

        {tab === 'general' && series.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-black text-gray-900">Tabla General</h2>
                <p className="text-sm text-gray-600">Suma de puntos de todas las series por club{phase ? ` · ${phase.name}` : ' · acumulada'}</p>
              </div>
              {phases.length > 0 && (
                <div role="group" aria-label="Fase" className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-lg">
                  {phases.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPhaseId(p.id)}
                      aria-pressed={phaseId === p.id}
                      className={`px-3 py-2 rounded-md text-sm font-bold ${phaseId === p.id ? 'bg-white text-emerald-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setPhaseId('all')}
                    aria-pressed={phaseId === 'all'}
                    className={`px-3 py-2 rounded-md text-sm font-bold ${phaseId === 'all' ? 'bg-white text-emerald-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Acumulada
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Pos</th>
                    <th className="px-4 py-3 text-left">Club</th>
                    {series.map((s) => (
                      <th key={s.id} className="px-2 py-3 text-center whitespace-nowrap" title={s.name}>
                        <a href={`/championship/${s.id}`} className="hover:text-emerald-700">{seriesLabel(s)}</a>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">DG</th>
                    <th className="px-4 py-3 text-center text-emerald-900">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {general.map((row, i) => (
                    <tr key={row.club.key} className="border-t border-gray-100 even:bg-gray-50/60">
                      <td className="px-4 py-3 font-black text-emerald-900">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <ClubLogo name={row.club.name} url={row.club.logo_url} />
                          <span className="font-bold text-gray-900">{row.club.name}</span>
                          {row.hasPending && (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full" title="Tiene partidos pendientes">
                              pendiente
                            </span>
                          )}
                        </div>
                      </td>
                      {series.map((s) => (
                        <td key={s.id} className="px-2 py-3 text-center text-gray-700">
                          {row.bySeries[s.id] === null ? <span className="text-gray-300">—</span> : row.bySeries[s.id]}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-semibold">{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td>
                      <td className="px-4 py-3 text-center font-black text-base text-emerald-900">
                        {row.points}
                        {row.adjustment_points !== 0 && (
                          <span className="ml-1 text-[11px] font-bold text-red-600" title="Incluye ajustes de la liga">
                            ({row.adjustment_points > 0 ? '+' : ''}{row.adjustment_points})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 text-xs text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
              <span>— = el club no tiene equipo en esa serie</span>
              <span>Puntos por partido: {league.points_win} / {league.points_draw} / {league.points_loss} (G/E/P)</span>
            </div>
            {adjustments.filter((a) => !a.phase_id || a.phase_id === phase?.id).length > 0 && (
              <div className="px-5 py-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Ajustes aplicados</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  {adjustments
                    .filter((a) => !a.phase_id || a.phase_id === phase?.id)
                    .map((a) => (
                      <li key={a.id}>
                        <span className="font-semibold">{clubs.get(a.base_team_id)?.name || 'Club'}</span>:{' '}
                        {a.points !== 0 && `${a.points > 0 ? '+' : ''}${a.points} pts `}
                        {a.goal_difference !== 0 && `${a.goal_difference > 0 ? '+' : ''}${a.goal_difference} DG `}
                        — {a.reason}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === 'series' && series.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {series.map((s) => {
              const table = seriesStandings(s.id, teams, matches, league);
              return (
                <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="p-4 border-b border-gray-100">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">{seriesLabel(s)}</p>
                    <p className="text-sm text-gray-600">{table.length} equipos</p>
                  </div>
                  <ol className="p-4 space-y-2 flex-1">
                    {table.slice(0, 4).map((r, i) => (
                      <li key={r.team_id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 font-black text-emerald-900">{i + 1}</span>
                        <ClubLogo name={r.name} url={r.logo_url} size="h-6 w-6" />
                        <span className="flex-1 font-semibold text-gray-900 truncate">{r.name}</span>
                        <span className="text-gray-500">{r.played} PJ</span>
                        <span className="w-10 text-right font-black text-emerald-900">{r.points}</span>
                      </li>
                    ))}
                  </ol>
                  <a href={`/championship/${s.id}`} className="px-4 py-3 border-t border-gray-100 text-sm font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 rounded-b-xl">
                    Ver serie completa <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </section>
        )}

        {tab === 'fechas' && series.length > 0 && (
          <section className="space-y-5">
            {rounds.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">No hay partidos programados.</div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => roundIdx > 0 && setRound(rounds[roundIdx - 1])}
                    disabled={roundIdx <= 0}
                    aria-label="Fecha anterior"
                    className="h-11 w-11 rounded-lg border border-gray-300 bg-white flex items-center justify-center disabled:opacity-40"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <select
                    value={round ?? ''}
                    onChange={(e) => setRound(Number(e.target.value))}
                    className="h-11 px-3 rounded-lg border border-gray-300 bg-white font-bold text-gray-900"
                    aria-label="Elegir fecha"
                  >
                    {rounds.map((r) => (
                      <option key={r} value={r}>{roundLabel(r)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => roundIdx < rounds.length - 1 && setRound(rounds[roundIdx + 1])}
                    disabled={roundIdx >= rounds.length - 1}
                    aria-label="Fecha siguiente"
                    className="h-11 w-11 rounded-lg border border-gray-300 bg-white flex items-center justify-center disabled:opacity-40"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {roundEncounters.map((e) => (
                    <article key={e.key} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-600 flex justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(e.date).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        {e.venue && <span className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5" />{e.venue}</span>}
                      </div>
                      <div className="px-4 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <ClubLogo name={e.home.name} url={e.home.logo_url} />
                          <span className="font-black text-gray-900 leading-tight">{e.home.name}</span>
                        </div>
                        <div className="text-center">
                          {e.finishedCount > 0 ? (
                            <>
                              <div className="text-2xl font-black text-emerald-900 whitespace-nowrap">{e.homeSeriesWon} – {e.awaySeriesWon}</div>
                              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">series</div>
                            </>
                          ) : (
                            <div className="text-sm font-bold text-gray-500">vs</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 justify-end min-w-0 text-right">
                          <span className="font-black text-gray-900 leading-tight">{e.away.name}</span>
                          <ClubLogo name={e.away.name} url={e.away.logo_url} />
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        {e.lines.map(({ championship, match }) => {
                          const done = isFinished(match);
                          const hs = match.home_score ?? 0;
                          const as = match.away_score ?? 0;
                          const win = 'font-black text-emerald-900 bg-emerald-50 rounded';
                          return (
                            <a
                              key={match.id}
                              href={`/championship/${championship.id}`}
                              className="grid grid-cols-[1fr_36px_14px_36px] items-center gap-1 py-2 border-t border-gray-100 text-sm hover:bg-gray-50"
                            >
                              <span className="text-gray-600 truncate">{seriesLabel(championship)}</span>
                              {done ? (
                                <>
                                  <span className={`text-center ${hs > as ? win : 'text-gray-800'}`}>{hs}</span>
                                  <span className="text-center text-gray-400">–</span>
                                  <span className={`text-center ${as > hs ? win : 'text-gray-800'}`}>{as}</span>
                                </>
                              ) : (
                                <span className="col-span-3 text-center text-xs text-gray-500">
                                  {match.status === 'cancelled'
                                    ? 'Suspendido'
                                    : new Date(match.match_date).getTime() < Date.now()
                                    ? 'Pendiente'
                                    : new Date(match.match_date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>

                {freeClubs.length > 0 && (
                  <p className="text-sm text-gray-600">
                    Libre: <span className="font-bold text-gray-900">{freeClubs.map((c) => c.name).join(', ')}</span>
                  </p>
                )}

                {pending.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-base font-black text-gray-900 mb-2">Partidos pendientes</h3>
                    <ul className="divide-y divide-gray-100">
                      {pending.map((e) => (
                        <li key={e.key} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
                          <span>
                            <span className="font-bold">{e.home.name} vs {e.away.name}</span>
                            <span className="text-gray-500"> · {roundLabel(e.round)}</span>
                          </span>
                          <button onClick={() => setRound(e.round)} className="text-emerald-700 font-bold hover:underline">
                            Ver fecha
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'clubes' && series.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from(clubs.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((club) => {
                const clubTeams = teams.filter((t) => (t.base_team_id || `name:${t.name.trim().toLowerCase()}`) === club.key);
                return (
                  <div key={club.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <ClubLogo name={club.name} url={club.logo_url} size="h-10 w-10" />
                      <div>
                        <p className="font-black text-gray-900">{club.name}</p>
                        <p className="text-xs text-gray-500">{clubTeams.length} series</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {series
                        .filter((s) => clubTeams.some((t) => t.championship_id === s.id))
                        .map((s) => (
                          <a key={s.id} href={`/championship/${s.id}`} className="px-3 py-1.5 rounded-full border border-gray-300 text-xs font-bold text-gray-700 hover:border-emerald-500 hover:text-emerald-700">
                            {seriesLabel(s)}
                          </a>
                        ))}
                    </div>
                  </div>
                );
              })}
          </section>
        )}

        {canManage && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Eres administrador de esta liga.
            <a href="/leagues" className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline">
              Todas las ligas <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </div>

      {showManage && (
        <LeagueManageModal
          league={league}
          onClose={() => setShowManage(false)}
          onSaved={() => {
            setShowManage(false);
            fetchData();
          }}
        />
      )}
    </Layout>
  );
};
