import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Championship, League, TopScorer } from '../types/database';
import { LeagueCard } from '../components/LeagueCard';
import { HomeSearch } from '../components/HomeSearch';
import { formatDateOnly } from '../utils/dates';
import { CreateTeamModal } from '../components/CreateTeamModal';
import { ArrowRight, MapPin, Plus, User } from 'lucide-react';

interface PlayerProfile {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  matches_played: number;
  total_goals: number;
  total_assists: number;
  avg_rating: string;
}

interface HomeMatch {
  id: string;
  championship_id: string;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  venue: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  championship: { name: string; series_name: string | null; league_id: string | null } | null;
}

const MATCH_SELECT =
  'id, championship_id, match_date, home_score, away_score, status, venue, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), championship:championships(name, series_name, league_id)';

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
const shortTime = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const champLabel = (m: HomeMatch) => {
  const c = m.championship;
  if (!c) return '';
  return c.series_name ? c.series_name : c.name;
};

const SectionHeader = ({ title, href, linkText }: { title: string; href?: string; linkText?: string }) => (
  <div className="flex items-end justify-between gap-4 mb-4">
    <h2 className="text-[22px] leading-7 font-extrabold text-mg-ink">{title}</h2>
    {href && (
      <a href={href} className="inline-flex items-center gap-1 text-sm font-bold text-mg-pitch hover:underline">
        {linkText}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
  </div>
);

const ResultRow = ({ m }: { m: HomeMatch }) => {
  const h = m.home_score ?? 0;
  const a = m.away_score ?? 0;
  return (
    <a href={`/championship/${m.championship_id}`} className="block px-5 py-3.5 border-t border-mg-line first:border-t-0 hover:bg-mg-surface-2">
      <div className="flex justify-between gap-3 text-[13px] text-mg-muted mb-1.5">
        <span className="truncate">{champLabel(m)}</span>
        <span className="flex-shrink-0 capitalize">{shortDay(m.match_date)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <span className={`text-[15px] leading-5 ${h > a ? 'font-extrabold' : 'font-semibold'} text-mg-ink`}>{m.home_team?.name}</span>
        <span className="mg-num flex items-center gap-1 text-2xl font-extrabold text-mg-ink">
          <span className={`min-w-[32px] text-center rounded-mg-sm py-0.5 ${h > a ? 'bg-mg-pitch-tint' : ''}`}>{h}</span>
          <span className="text-mg-muted text-lg">–</span>
          <span className={`min-w-[32px] text-center rounded-mg-sm py-0.5 ${a > h ? 'bg-mg-pitch-tint' : ''}`}>{a}</span>
        </span>
        <span className={`text-[15px] leading-5 text-right ${a > h ? 'font-extrabold' : 'font-semibold'} text-mg-ink`}>{m.away_team?.name}</span>
      </div>
    </a>
  );
};

const UpcomingRow = ({ m }: { m: HomeMatch }) => (
  <a href={`/championship/${m.championship_id}`} className="block px-5 py-3.5 border-t border-mg-line first:border-t-0 hover:bg-mg-surface-2">
    <div className="flex justify-between gap-3 text-[13px] text-mg-muted mb-1.5">
      <span className="truncate">{champLabel(m)}</span>
      {m.venue && (
        <span className="flex items-center gap-1 truncate">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {m.venue}
        </span>
      )}
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <span className="text-[15px] leading-5 font-bold text-mg-ink">{m.home_team?.name}</span>
      <span className="text-center">
        <span className="block mg-num text-lg leading-5 font-bold uppercase text-mg-gold-ink">{shortDay(m.match_date)}</span>
        <span className="block text-[13px] font-semibold text-mg-muted">{shortTime(m.match_date)}</span>
      </span>
      <span className="text-[15px] leading-5 text-right font-bold text-mg-ink">{m.away_team?.name}</span>
    </div>
  </a>
);

const EmptyPanel = ({ text }: { text: string }) => <p className="px-5 py-8 text-center text-sm text-mg-muted">{text}</p>;

export const Home = () => {
  const { profile } = useAuth();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [results, setResults] = useState<HomeMatch[]>([]);
  const [upcoming, setUpcoming] = useState<HomeMatch[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [selectedChampionship, setSelectedChampionship] = useState<Championship | null>(null);

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    try {
      const nowIso = new Date().toISOString();
      const [{ data: champData }, { data: leagueData }, { data: resultData }, { data: upcomingData }] = await Promise.all([
        supabase
          .from('championships')
          .select('*, admin:profiles!championships_admin_id_fkey(full_name)')
          .eq('status', 'active')
          .is('league_id', null)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase.from('leagues').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(4),
        supabase.from('matches').select(MATCH_SELECT).eq('status', 'finished').lte('match_date', nowIso).order('match_date', { ascending: false }).limit(6),
        supabase.from('matches').select(MATCH_SELECT).eq('status', 'scheduled').gte('match_date', nowIso).order('match_date', { ascending: true }).limit(6),
      ]);

      // Las series de una liga se muestran dentro de la tarjeta de la liga
      setChampionships((champData || []) as Championship[]);
      setLeagues((leagueData || []) as League[]);
      setResults((resultData || []) as unknown as HomeMatch[]);
      setUpcoming((upcomingData || []) as unknown as HomeMatch[]);

      const { data: goalsData } = await supabase
        .from('match_events')
        .select(`
          player_id,
          team_id,
          additional_info,
          player_profiles:player_id (
            id,
            full_name
          ),
          teams:team_id (
            id,
            name
          )
        `)
        .eq('event_type', 'goal')
        .not('player_id', 'is', null);

      if (goalsData) {
        const scorersMap = new Map<string, TopScorer>();
        goalsData.forEach((goal: any) => {
          if (goal.player_profiles && goal.player_id && goal.additional_info?.type !== 'own_goal') {
            const existing = scorersMap.get(goal.player_id);
            if (existing) {
              existing.goals += 1;
            } else {
              scorersMap.set(goal.player_id, {
                player_id: goal.player_id,
                player_name: goal.player_profiles.full_name,
                team_name: goal.teams?.name || 'Sin equipo',
                goals: 1,
                assists: 0,
              });
            }
          }
        });
        setTopScorers(Array.from(scorersMap.values()).sort((a, b) => b.goals - a.goals).slice(0, 5));
      }

      if (profile) {
        const { data: profileData } = await supabase.from('player_career_stats').select('*').eq('id', profile.id).maybeSingle();
        if (profileData) setPlayerProfile(profileData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = (championship: Championship) => {
    setSelectedChampionship(championship);
    setShowCreateTeamModal(true);
  };

  return (
    <Layout>
      <div className="space-y-10 font-sans text-mg-ink">
        {/* Portada: el buscador es lo primero */}
        <section className="relative overflow-hidden rounded-mg-lg bg-mg-navy text-mg-on-navy">
          <div className="mg-grass absolute inset-y-0 right-0 w-[38%] hidden md:block" aria-hidden="true">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-mg-navy to-transparent" />
          </div>
          <div className="relative px-5 sm:px-8 md:px-10 py-10 md:py-12 md:max-w-[66%]">
            <p className="mg-label text-mg-on-navy-muted mb-2">Ligas · Series · Campeonatos</p>
            <h1 className="font-display font-extrabold uppercase text-[44px] leading-[42px] sm:text-[56px] sm:leading-[54px] tracking-[0.01em] mb-3">
              Encuentra tu liga
            </h1>
            <p className="text-mg-on-navy-muted text-[15px] leading-[22px] mb-6 max-w-lg">
              Tablas de posiciones, resultados y fechas de tu liga, tu serie o tu club.
            </p>
            <HomeSearch />
            {leagues.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-mg-on-navy-muted mr-1">Ligas activas:</span>
                {leagues.map((l) => (
                  <a
                    key={l.id}
                    href={`/league/${l.id}`}
                    className="px-3.5 py-2 rounded-full border border-mg-on-navy-muted text-[13px] font-bold text-mg-on-navy hover:bg-mg-gold hover:text-mg-on-gold hover:border-mg-gold"
                  >
                    {l.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        {profile && playerProfile && (
          <section className="bg-mg-surface border border-mg-line rounded-mg-lg px-5 sm:px-6 py-5 flex flex-wrap items-center gap-5">
            {playerProfile.photo_url ? (
              <img src={playerProfile.photo_url} alt="" className="w-16 h-16 rounded-mg-md object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-mg-md bg-mg-surface-2 flex items-center justify-center flex-shrink-0">
                <User className="h-8 w-8 text-mg-muted" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 min-w-[10rem]">
              <p className="mg-label text-mg-muted">Tu ficha{playerProfile.position ? ` · ${playerProfile.position}` : ''}</p>
              <p className="text-[17px] font-extrabold">{playerProfile.full_name}</p>
            </div>
            <dl className="flex gap-6 sm:gap-8">
              {[
                ['Partidos', playerProfile.matches_played],
                ['Goles', playerProfile.total_goals],
                ['Asist.', playerProfile.total_assists],
                ['Nota', parseFloat(playerProfile.avg_rating || '0').toFixed(1)],
              ].map(([k, v]) => (
                <div key={k as string} className="text-center">
                  <dd className="mg-num text-[28px] leading-8 font-extrabold">{v}</dd>
                  <dt className="text-[12px] font-bold uppercase tracking-wide text-mg-muted">{k}</dt>
                </div>
              ))}
            </dl>
            <a href={`/player/${profile.id}`} className="inline-flex items-center min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong font-extrabold text-sm hover:bg-mg-surface-2">
              Ver mi perfil
            </a>
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-label="Cargando" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <SectionHeader title="Últimos resultados" />
                <div className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
                  {results.length === 0 ? <EmptyPanel text="Todavía no hay partidos jugados." /> : results.map((m) => <ResultRow key={m.id} m={m} />)}
                </div>
              </section>
              <section>
                <SectionHeader title="Próximos partidos" />
                <div className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
                  {upcoming.length === 0 ? <EmptyPanel text="No hay partidos programados por ahora." /> : upcoming.map((m) => <UpcomingRow key={m.id} m={m} />)}
                </div>
              </section>
            </div>

            {leagues.length > 0 && (
              <section>
                <SectionHeader title="Ligas" href="/leagues" linkText="Ver todas" />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {leagues.map((l) => (
                    <LeagueCard key={l.id} league={l} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeader title="Campeonatos" href="/search" linkText="Ver todos" />
              {championships.length === 0 ? (
                <div className="bg-mg-surface border border-mg-line rounded-mg-lg">
                  <EmptyPanel text="No hay campeonatos activos fuera de una liga." />
                </div>
              ) : (
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                  {championships.map((c) => (
                    <article key={c.id} className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden flex flex-col hover:shadow-mg-card transition-shadow">
                      <a href={`/championship/${c.id}`} className="relative h-24 mg-grass flex items-end p-3">
                        {c.image_url && <img src={c.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                        <span className="relative inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-mg-surface text-mg-ink text-[11px] font-extrabold uppercase tracking-wide">
                          <span className="w-2 h-2 rounded-full bg-mg-flame" aria-hidden="true" />
                          En curso
                        </span>
                      </a>
                      <div className="p-5 flex flex-col gap-1 flex-1">
                        <p className="mg-label text-mg-muted capitalize">{[c.sport, c.venue].filter(Boolean).join(' · ')}</p>
                        <a href={`/championship/${c.id}`} className="text-[17px] leading-6 font-extrabold hover:underline">{c.name}</a>
                        {c.start_date && (
                          <p className="text-[13px] text-mg-muted">Desde {formatDateOnly(c.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        )}
                        {profile && (profile.role === 'admin_sistema' || c.admin_id === profile.id) && (
                          <button
                            onClick={() => handleCreateTeam(c)}
                            className="mt-3 self-start inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-mg-md border border-mg-line-strong text-sm font-extrabold hover:bg-mg-surface-2"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Crear equipo
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {topScorers.length > 0 && (
              <section className="max-w-2xl">
                <SectionHeader title="Goleadores" />
                <ol className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
                  {topScorers.map((s, i) => (
                    <li key={s.player_id} className={`flex items-center gap-4 px-5 py-3 border-t border-mg-line first:border-t-0 ${i === 0 ? 'bg-mg-pitch-tint' : ''}`}>
                      <span className={`mg-num w-8 h-8 rounded-mg-sm flex items-center justify-center text-lg font-extrabold ${i === 0 ? 'bg-mg-gold text-mg-on-gold' : ''}`}>{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-extrabold truncate">{s.player_name}</span>
                        <span className="block text-[13px] text-mg-muted truncate">{s.team_name}</span>
                      </span>
                      <span className="mg-num text-[28px] leading-8 font-extrabold">{s.goals}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>

      {showCreateTeamModal && selectedChampionship && (
        <CreateTeamModal
          championship={selectedChampionship}
          onClose={() => {
            setShowCreateTeamModal(false);
            setSelectedChampionship(null);
          }}
          onSuccess={() => {
            setShowCreateTeamModal(false);
            setSelectedChampionship(null);
            window.location.href = '/my-teams';
          }}
        />
      )}
    </Layout>
  );
};
