import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { TreasuryPanel } from '../components/treasury/TreasuryPanel';
import { PlayerStatementView } from '../components/treasury/PlayerStatementView';
import { useTreasuryOverview, useTreasuryRole, useTreasuryStatement } from '../hooks/useTreasury';
import { secondaryBtn } from '../components/payments/PaymentsUi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Message = ({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) => (
  <div role={onRetry ? 'alert' : 'status'} className="bg-mg-surface border border-mg-line rounded-mg-lg p-8 text-center space-y-2">
    <p className="font-bold">{title}</p>
    {text && <p className="text-sm text-mg-muted">{text}</p>}
    {onRetry && <button type="button" onClick={onRetry} className={secondaryBtn}>Reintentar</button>}
  </div>
);
const Loading = () => <p role="status" className="py-16 text-center text-mg-muted">Cargando tesorería…</p>;

const Panel = ({ teamId }: { teamId: string }) => {
  const { status, data, reload } = useTreasuryOverview(teamId);
  if (status === 'loading') return <Loading />;
  if (status === 'denied') return <Message title="No administras la tesorería de este equipo." />;
  if (status === 'error' || !data) return <Message title="No se pudo cargar la tesorería." onRetry={reload} />;
  return <TreasuryPanel data={data} onChanged={reload} />;
};

const Statement = ({ teamId, playerId }: { teamId: string; playerId: string | null }) => {
  const { status, data, reload } = useTreasuryStatement(teamId, playerId);
  if (status === 'loading') return <Loading />;
  if (status === 'denied') return <Message title="No tienes acceso a estas cuotas." text="Cada jugador ve solo las suyas." />;
  if (status === 'error' || !data) return <Message title="No se pudieron cargar las cuotas." onRetry={reload} />;
  return <PlayerStatementView data={data} onChanged={reload} />;
};

const Router = ({ teamId, playerId }: { teamId: string; playerId: string | null }) => {
  const { role, error } = useTreasuryRole(teamId);
  if (error) return <Message title="No se pudo cargar la tesorería." />;
  if (role === undefined) return <Loading />;
  if (role === null) return <Message title="No eres parte de este equipo." />;
  const manages = role !== 'player';
  if (manages && !playerId) return <Panel teamId={teamId} />;
  return <Statement teamId={teamId} playerId={manages ? playerId : null} />;
};

/**
 * /tesoreria?team=<base_team_id>             panel (dueño, capitán, tesorero) o "mis cuotas" (jugador)
 * /tesoreria?team=<base_team_id>&player=<id> cuotas de un jugador (solo tesorería)
 */
export const Treasury = () => {
  const { profile, loading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get('team') || '';
  const playerId = params.get('player');

  let body;
  if (loading) body = <Loading />;
  else if (!profile) body = <Message title="Inicia sesión para ver la tesorería." />;
  else if (!UUID_RE.test(teamId)) body = <Message title="Página no encontrada." />;
  else body = <Router key={`${teamId}:${playerId}`} teamId={teamId} playerId={playerId && UUID_RE.test(playerId) ? playerId : null} />;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto font-sans text-mg-ink">{body}</div>
    </Layout>
  );
};
