import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Championship, League, LeagueAdjustment, LeaguePhase } from '../types/database';
import { generalStandings, GeneralRow, LeagueMatchRow, LeagueTeamRow, RawTeamRow, seriesLabel, toLeagueTeam } from '../utils/leagueStandings';
import { Trophy } from 'lucide-react';

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
      const [{ data: t }, { data: m }] = await Promise.all([
        supabase.from('teams').select('id, championship_id, name, base_team_id, logo_url, base_team:base_teams(logo_url)').in('championship_id', ids),
        supabase.from('matches').select('id, championship_id, home_team_id, away_team_id, match_date, round, home_score, away_score, status, venue').in('championship_id', ids),
      ]);
      const teams: LeagueTeamRow[] = ((t || []) as RawTeamRow[]).map(toLeagueTeam);
      const phases = (ph || []) as LeaguePhase[];
      const def = phases.find((p) => p.is_default) || null;
      setPhase(def);
      const rows = generalStandings(league, s, teams, (m || []) as LeagueMatchRow[], (adj || []) as LeagueAdjustment[], def);
      setClubCount(rows.length);
      setTop(rows.slice(0, 3));
    };
    load();
  }, [league]);

  return (
    <article className="bg-white rounded-2xl shadow-lg border-2 border-gray-100 hover:border-emerald-300 transition-all overflow-hidden flex flex-col">
      <div className="bg-emerald-950 text-white p-5 flex items-center gap-4">
        {league.logo_url ? (
          <img src={league.logo_url} alt="" className="h-14 w-14 rounded-full object-cover border-[3px] border-amber-400 bg-white flex-shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-white text-emerald-900 flex items-center justify-center border-[3px] border-amber-400 flex-shrink-0">
            <Trophy className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
            Liga · {series.length} series{clubCount ? ` · ${clubCount} clubes` : ''}
          </p>
          <a href={`/league/${league.id}`} className="block text-xl font-black leading-tight hover:underline">
            {league.name}{league.season ? ` ${league.season}` : ''}
          </a>
        </div>
      </div>
      <div className="p-5 grid gap-5 sm:grid-cols-2 flex-1">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">
            Tabla general{phase ? ` · ${phase.name}` : ''}
          </p>
          {top.length === 0 ? (
            <p className="text-sm text-gray-500">Sin partidos jugados aún.</p>
          ) : (
            <ol className="space-y-1.5">
              {top.map((r, i) => (
                <li key={r.club.key} className="flex items-center gap-2 text-sm">
                  <span className="w-5 font-black text-emerald-900">{i + 1}</span>
                  <span className="flex-1 font-semibold text-gray-900 truncate">{r.club.name}</span>
                  <span className="font-black text-emerald-900">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Series</p>
          <div className="flex flex-wrap gap-1.5">
            {series.map((s) => (
              <a key={s.id} href={`/championship/${s.id}`} className="px-3 py-1.5 rounded-full border border-gray-300 text-xs font-bold text-gray-700 hover:border-emerald-500 hover:text-emerald-700">
                {seriesLabel(s)}
              </a>
            ))}
          </div>
        </div>
      </div>
      <a href={`/league/${league.id}`} className="m-5 mt-0 text-center px-5 py-3 text-emerald-700 font-bold text-sm hover:bg-emerald-50 rounded-xl border-2 border-emerald-600">
        Ver liga
      </a>
    </article>
  );
};
