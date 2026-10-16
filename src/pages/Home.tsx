import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { LeagueCard } from '../components/LeagueCard';
import { CreateTeamModal } from '../components/CreateTeamModal';
import { HomeHero } from '../components/home/HomeHero';
import { MatchPanels } from '../components/home/MatchPanels';
import { ChampionshipGrid } from '../components/home/ChampionshipGrid';
import { TopScorers } from '../components/home/TopScorers';
import { PlayerStrip } from '../components/home/PlayerStrip';
import { SectionHeader } from '../components/home/SectionHeader';
import { OrganizerCta } from '../components/home/OrganizerCta';
import { useHomeData, usePlayerCareer } from '../hooks/useHomeData';
import { HomeChampionship } from '../types/home';

/**
 * Inicio. Pensado para miles de visitas:
 *  - 5 consultas en paralelo, todas con LIMIT y servidas por índices (ver migración 20261009220000)
 *  - tabla general de las ligas y goleadores calculados en el servidor (RPC), no en el navegador
 *  - caché de 60 s en la sesión y cancelación de peticiones al salir de la página
 */
export const Home = () => {
  const { profile } = useAuth();
  const { data, status, retry } = useHomeData();
  const career = usePlayerCareer(profile?.id);
  const [teamFor, setTeamFor] = useState<HomeChampionship | null>(null);

  const canCreateTeam = (c: HomeChampionship) => !!profile && (profile.role === 'admin_sistema' || c.admin_id === profile.id);

  return (
    <Layout>
      <div className="space-y-10 font-sans text-mg-ink">
        <HomeHero leagues={data?.leagues ?? []} />

        {career && <PlayerStrip career={career} />}

        {status === 'loading' && !data && (
          <div className="flex items-center justify-center py-16" role="status">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-hidden="true" />
            <span className="sr-only">Cargando…</span>
          </div>
        )}

        {status === 'error' && !data && (
          <div role="alert" className="bg-mg-danger-tint text-mg-ink rounded-mg-lg px-5 py-6 flex flex-wrap items-center justify-between gap-4">
            <p className="font-semibold">No pudimos cargar los partidos y las ligas. Revisa tu conexión.</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        )}

        {data && (
          <>
            <MatchPanels results={data.results} upcoming={data.upcoming} />

            {data.leagues.length > 0 && (
              <section aria-labelledby="home-leagues">
                <SectionHeader id="home-leagues" title="Ligas" href="/leagues" linkText="Ver todas" />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {data.leagues.map((l) => (
                    <LeagueCard key={l.id} league={l} />
                  ))}
                </div>
              </section>
            )}

            <ChampionshipGrid championships={data.championships} canCreateTeam={canCreateTeam} onCreateTeam={setTeamFor} />

            <TopScorers scorers={data.scorers} />
          </>
        )}

        {(!profile || profile.role === 'usuario' || profile.role === 'capitan') && <OrganizerCta />}
      </div>

      {teamFor && (
        <CreateTeamModal
          championship={teamFor}
          onClose={() => setTeamFor(null)}
          onSuccess={() => {
            setTeamFor(null);
            window.location.href = '/my-teams';
          }}
        />
      )}
    </Layout>
  );
};
