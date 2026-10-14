import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { ChampionshipPaymentsView } from '../components/payments/ChampionshipPaymentsView';
import { TeamStatementView } from '../components/payments/TeamStatementView';
import { useChampionshipPayments, useTeamStatement } from '../hooks/usePayments';
import { secondaryBtn } from '../components/payments/PaymentsUi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Message = ({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) => (
  <div role={onRetry ? 'alert' : 'status'} className="bg-mg-surface border border-mg-line rounded-mg-lg p-8 text-center space-y-2">
    <p className="font-bold">{title}</p>
    {text && <p className="text-sm text-mg-muted">{text}</p>}
    {onRetry && (
      <button type="button" onClick={onRetry} className={secondaryBtn}>
        Reintentar
      </button>
    )}
  </div>
);

const ChampionshipPayments = ({ id }: { id: string }) => {
  const { status, championship, canManage, balances, settings, reload } = useChampionshipPayments(id);
  if (status === 'loading') return <p role="status" className="py-16 text-center text-mg-muted">Cargando pagos…</p>;
  if (status === 'denied') return <Message title="No tienes acceso a los pagos de este campeonato." text="Solo lo ven sus administradores y encargados de turno." />;
  if (status === 'error' || !championship) return <Message title="No se pudieron cargar los pagos." onRetry={reload} />;
  return <ChampionshipPaymentsView championship={championship} canManage={canManage} balances={balances} settings={settings} onChanged={reload} />;
};

const TeamPayments = ({ id }: { id: string }) => {
  const { status, statement, reload } = useTeamStatement(id);
  if (status === 'loading') return <p role="status" className="py-16 text-center text-mg-muted">Cargando estado de cuenta…</p>;
  if (status === 'denied') return <Message title="No tienes acceso a este estado de cuenta." text="Lo ven el capitán del equipo y el personal del campeonato." />;
  if (status === 'error' || !statement) return <Message title="No se pudo cargar el estado de cuenta." onRetry={reload} />;
  const back = statement.permissions.collect ? `/pagos?championship=${statement.championship.id}` : '/my-teams';
  return <TeamStatementView statement={statement} backHref={back} onChanged={reload} />;
};

/**
 * /pagos?championship=<id>  panel de cobros del campeonato (administradores y encargados de turno)
 * /pagos?team=<id>          estado de cuenta de un equipo (personal del campeonato o capitán)
 */
export const Payments = () => {
  const { profile, loading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const championshipId = params.get('championship') || '';
  const teamId = params.get('team') || '';

  let body;
  if (loading) body = <p role="status" className="py-16 text-center text-mg-muted">Cargando…</p>;
  else if (!profile) body = <Message title="Inicia sesión para ver los pagos." />;
  else if (UUID_RE.test(teamId)) body = <TeamPayments key={teamId} id={teamId} />;
  else if (UUID_RE.test(championshipId)) body = <ChampionshipPayments key={championshipId} id={championshipId} />;
  else body = <Message title="Página no encontrada." />;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto font-sans text-mg-ink">{body}</div>
    </Layout>
  );
};
