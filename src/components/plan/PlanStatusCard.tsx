import { Crown, FileImage, Lock, Trophy } from 'lucide-react';
import { OrganizerPlan, daysUntil, formatPlanDate } from '../../hooks/useOrganizerPlan';

interface Props {
  plan: OrganizerPlan;
}

const Meter = ({ value, max, label, warnWhenFull = true }: { value: number; max: number; label: string; warnWhenFull?: boolean }) => {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="h-1.5 rounded-full bg-mg-surface-2 overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`h-full ${warnWhenFull && value >= max ? 'bg-mg-danger' : 'bg-mg-pitch'}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

/** Estado del plan del organizador (Administrar). */
export const PlanStatusCard = ({ plan }: Props) => {
  if (plan.plan === 'premium') {
    return (
      <p className="inline-flex flex-wrap items-center gap-2 rounded-mg-md bg-mg-pitch-tint px-4 py-2 text-sm font-bold text-mg-pitch-deep font-sans">
        <Crown className="h-4 w-4" aria-hidden="true" />
        Plan Premium{plan.premium_until ? ` · hasta el ${formatPlanDate(plan.premium_until)}` : ''}
      </p>
    );
  }

  if (plan.locked) {
    return (
      <section role="alert" className="flex gap-4 items-start rounded-mg-lg border border-[#f3c4bf] bg-mg-danger-tint px-5 py-4 font-sans text-mg-ink">
        <Lock className="h-6 w-6 flex-none text-mg-danger mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-extrabold text-lg">Tu periodo gratis terminó</h2>
          <p className="text-sm">
            Tu liga sigue publicada y todos pueden ver la tabla, el fixture y los resultados, pero quedó en <strong>solo lectura</strong>: no se pueden
            cargar partidos ni resultados.{' '}
            <a href="mailto:contacto@mediogol.cl?subject=Activar%20plan%20Premium" className="font-bold underline">
              Escríbenos para activar el plan Premium
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  const days = daysUntil(plan.trial_ends_at);
  const sheetsLeft = Math.max(0, (plan.sheet_limit ?? 0) - plan.sheets_used);
  const leagueLimit = plan.league_limit ?? 1;

  return (
    <section aria-labelledby="plan-title" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card font-sans text-mg-ink">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-mg-line">
        <span className="px-3 py-1 rounded-full bg-mg-navy text-mg-on-navy text-xs font-extrabold uppercase tracking-wide">Plan Gratis</span>
        <h2 id="plan-title" className="font-extrabold">
          {plan.trial_ends_at
            ? days !== null && days <= 30
              ? `Te quedan ${days} ${days === 1 ? 'día' : 'días'} gratis`
              : `Gratis hasta el ${formatPlanDate(plan.trial_ends_at)}`
            : '6 meses gratis desde que creas tu liga'}
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 px-5 py-4">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Trophy className="h-4 w-4 text-mg-pitch-deep" aria-hidden="true" />
            Liga publicada: {Math.min(plan.leagues, leagueLimit)} de {leagueLimit}
          </p>
          <Meter value={plan.leagues} max={leagueLimit} label="Ligas usadas" warnWhenFull={false} />
          <p className="text-xs text-mg-muted">Tus campeonatos se agregan como series de esa liga.</p>
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold">
            <FileImage className="h-4 w-4 text-mg-pitch-deep" aria-hidden="true" />
            Papeletas de prueba: {plan.sheets_used} de {plan.sheet_limit} usadas
          </p>
          <Meter value={plan.sheets_used} max={plan.sheet_limit ?? 0} label="Papeletas de prueba usadas" />
          <p className="text-xs text-mg-muted">
            {sheetsLeft > 0
              ? `Te ${sheetsLeft === 1 ? 'queda 1 lectura automática' : `quedan ${sheetsLeft} lecturas automáticas`}. Después, la lectura de papeletas es Premium; el ingreso manual sigue gratis.`
              : 'Ya usaste tus papeletas de prueba. Puedes seguir cargando resultados a mano con «Registrar Detalles».'}
          </p>
        </div>
      </div>
    </section>
  );
};
