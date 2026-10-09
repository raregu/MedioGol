import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Championship, League, LeagueAdjustment, LeaguePhase } from '../types/database';
import { generalStandings, GeneralRow, LeagueMatchRow, LeagueTeamRow, RawTeamRow, seriesLabel, toLeagueTeam } from '../utils/leagueStandings';
import { fetchAllRows } from '../utils/fetchAll';
import { ArrowRight, Trophy } from 'lucide-react';

/** Tarjeta de una liga: nombre, series y top 3 de la tabla general (fase por defecto). */
export const LeagueCard = ({ league }: { league: League }) => {
  const [series, setSeries] = useState<Championship[]>([]);
  const [top, setTop] = useState<GeneralRow[]>([]);
  const [phase, setPhase] = useState<LeaguePhase | null>(null);
  const [clubCount, setClubCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ data: champs }, { data: ph }, { data: adj }] = await Promise.all([
        supabase.from('championships').select('*').eq('league_id', league.id).order('display_order').order('name'),
        supabase.from('league_phases').select('*').eq('league_id', league.id),
        supabase.from('league_adjustments').select('*').eq('league_id', league.id),
      ]);
      const s = (champs || []) as Championship[];
      setSeries(s);
      if (!s.length) return;
      const ids = s.map((c) => c.id);
      const [t, m] = await Promise.all([
        fetchAllRows<RawTeamRow>((from, to) =>
          supabase.from('teams').select('id, championship_id, name, base_team_id, logo_url, base_team:base_teams(logo_url)').in('championship_id', ids).order('id').range(from, to)
        ),
        fetchAllRows<LeagueMatchRow>((from, to) =>
          supabase
            .from('matches')
            .select('id, championship_id, home_team_id, away_team_id, match_date, round, home_score, away_score, status, venue')
            .in('championship_id', ids)
            .eq('status', 'finished')
            .order('id')
            .range(from, to)
        ),
      ]);
      const teams: LeagueTeamRow[] = t.map(toLeagueTeam);
      const phases = (ph || []) as LeaguePhase[];
      const def = phases.find((p) => p.is_default) || null;
      setPhase(def);
      const rows = generalStandings(league, s, teams, m, (adj || []) as LeagueAdjustment[], def);
      setClubCount(rows.length);
      setTop(rows.slice(0, 3));
    };
    load();
  }, [league]);

  return (
    <article className="bg-mg-surface rounded-mg-lg border border-mg-line hover:shadow-mg-card transition-shadow overflow-hidden flex flex-col">
      <div className="bg-mg-navy text-mg-on-navy px-5 sm:px-6 py-5 flex flex-wrap items-center gap-4">
        {league.logo_url ? (
          <img src={league.logo_url} alt="" className="h-14 w-14 rounded-full object-cover bg-white flex-shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-mg-surface text-mg-ink flex items-center justify-center flex-shrink-0">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-[12rem]">
          <p className="mg-label text-mg-on-navy-muted">
            Liga · {series.length} series{clubCount ? ` · ${clubCount} clubes` : ''}
          </p>
          <a href={`/league/${league.id}`} className="block font-display text-[28px] leading-[30px] font-extrabold uppercase tracking-[0.01em] hover:underline">
            {league.name}{league.season ? ` ${league.season}` : ''}
          </a>
        </div>
        <a href={`/league/${league.id}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-mg-md bg-mg-gold text-mg-on-gold font-extrabold text-sm hover:brightness-105">
          Ver liga
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <div className="px-5 sm:px-6 py-5 grid gap-6 sm:grid-cols-2 flex-1">
        <div>
          <p className="mg-label text-mg-muted mb-3">
            Tabla general{phase ? ` · ${phase.name}` : ''}
          </p>
          {top.length === 0 ? (
            <p className="text-sm text-mg-muted">Sin partidos jugados aún.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((r, i) => (
                <li key={r.club.key} className="flex items-center gap-3">
                  <span className={`mg-num w-7 h-7 rounded-mg-sm flex items-center justify-center text-lg font-extrabold ${i === 0 ? 'bg-mg-gold text-mg-on-gold' : 'text-mg-ink'}`}>{i + 1}</span>
                  <span className="flex-1 font-bold text-mg-ink truncate">{r.club.name}</span>
                  <span className="mg-num text-lg font-extrabold text-mg-ink">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <p className="mg-label text-mg-muted mb-3">Series</p>
          <div className="flex flex-wrap gap-2">
            {series.map((s) => (
              <a key={s.id} href={`/championship/${s.id}`} className="px-3.5 py-2 rounded-full border border-mg-line-strong text-[13px] font-bold text-mg-ink hover:bg-mg-navy hover:border-mg-navy hover:text-mg-on-navy">
                {seriesLabel(s)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
};
