import { ReactNode, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, ClipboardList, QrCode, Wallet } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { OrganizerApproved } from '../components/organizer/OrganizerRequestStatus';
import { primaryBtn, secondaryBtn } from '../components/payments/PaymentsUi';
import { FREE_PLAN } from '../hooks/useOrganizerPlan';

const BENEFITS = [
  { icon: BarChart3, title: 'Tabla y goleadores al día', text: 'Se calculan solos al cargar cada resultado.' },
  { icon: CalendarDays, title: 'Fixture y resultados', text: 'Fechas, horarios y canchas a la vista de todos.' },
  { icon: ClipboardList, title: 'Papeletas digitales', text: 'Goles, tarjetas y observaciones de cada partido.' },
  { icon: Wallet, title: 'Pagos de los equipos', text: 'Inscripciones, arbitrajes y multas en orden.' },
  { icon: QrCode, title: 'Credenciales con QR', text: 'Validación de jugadores en la cancha.' },
];

const HOW = ['Crea tu cuenta de organizador (gratis, al instante).', 'Crea tu liga y sus series.', 'Carga equipos, fixture y resultados, y comparte el enlace.'];

const FreePlanList = () => (
  <ul className="space-y-1.5 text-sm">
    {[
      `Publica ${FREE_PLAN.leagues} liga con todas sus series.`,
      `${FREE_PLAN.months} meses gratis desde que creas tu liga.`,
      `${FREE_PLAN.sheets} papeletas de prueba con lectura automática de goles y tarjetas.`,
    ].map((t) => (
      <li key={t} className="flex gap-2 items-start">
        <CheckCircle2 className="h-4 w-4 text-mg-pitch-deep flex-shrink-0 mt-0.5" aria-hidden="true" />
        {t}
      </li>
    ))}
  </ul>
);

/** /organizar: crear o activar una cuenta de organizador con plan Gratis (sin aprobación). */
export const Organize = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOrganizer = profile?.role === 'admin_campeonato' || profile?.role === 'admin_sistema';

  useEffect(() => {
    document.title = 'Organiza tu liga · MedioGol';
  }, []);

  const activate = async () => {
    setActivating(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('become_organizer');
    if (rpcError) {
      setActivating(false);
      setError(rpcError.message || 'No pudimos activar tu cuenta. Intenta de nuevo.');
      return;
    }
    await refreshProfile().catch((e) => console.error('refreshProfile', e));
    window.location.href = '/admin';
  };

  let body: ReactNode = null;
  if (loading) {
    body = (
      <div className="flex justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  } else if (!user) {
    body = (
      <section aria-labelledby="org-start" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card p-5 sm:p-6 space-y-4">
        <h2 id="org-start" className="font-display text-2xl font-extrabold uppercase">
          Empieza gratis
        </h2>
        <FreePlanList />
        <div className="flex flex-wrap gap-3">
          <a href={`/register?organizador=1&next=${encodeURIComponent('/admin')}`} className={primaryBtn}>
            Crear cuenta de organizador
          </a>
          <a href={`/login?next=${encodeURIComponent('/organizar')}`} className={secondaryBtn}>
            Ya tengo cuenta
          </a>
        </div>
      </section>
    );
  } else if (isOrganizer) {
    body = <OrganizerApproved />;
  } else if (profile?.role === 'encargado_turno') {
    body = (
      <p role="status" className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 text-sm">
        Tu cuenta es de encargado de turno. Si quieres organizar tu propia liga, pide al administrador que cambie tu cuenta.
      </p>
    );
  } else {
    body = (
      <section aria-labelledby="org-activate" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card p-5 sm:p-6 space-y-4">
        <h2 id="org-activate" className="font-display text-2xl font-extrabold uppercase">
          Activa tu cuenta de organizador
        </h2>
        <p className="text-sm">Tu cuenta pasa a ser de organizador al instante, con el plan Gratis:</p>
        <FreePlanList />
        {error && (
          <p role="alert" className="bg-mg-danger-tint rounded-mg-md px-4 py-2 text-sm font-semibold">
            {error}
          </p>
        )}
        <button type="button" onClick={activate} disabled={activating} className={primaryBtn}>
          {activating ? 'Activando…' : 'Activar gratis'}
        </button>
      </section>
    );
  }

  return (
    <Layout>
      <div className="font-sans text-mg-ink grid gap-8 lg:grid-cols-[1fr_minmax(0,560px)] items-start">
        <header className="space-y-5">
          <p className="mg-label text-mg-pitch-deep">Para organizadores</p>
          <h1 className="font-display text-[40px] sm:text-[52px] leading-none font-extrabold uppercase">Organiza tu liga en MedioGol</h1>
          <p className="text-lg text-mg-muted max-w-prose">
            Si organizas una liga o un campeonato, crea tu cuenta gratis y gestiona todo desde un solo lugar. Los jugadores y capitanes lo
            siguen desde el celular.
          </p>
          <ul className="grid sm:grid-cols-2 gap-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 items-start bg-mg-surface border border-mg-line rounded-mg-md p-3">
                <Icon className="h-5 w-5 text-mg-pitch-deep flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <span className="block font-extrabold text-sm">{title}</span>
                  <span className="block text-xs text-mg-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <section aria-labelledby="org-how" className="space-y-2">
            <h2 id="org-how" className="mg-label text-mg-muted">
              Cómo funciona
            </h2>
            <ol className="space-y-2">
              {HOW.map((t, i) => (
                <li key={t} className="flex gap-3 items-center text-sm">
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-mg-navy text-mg-on-navy font-extrabold text-xs flex-shrink-0" aria-hidden="true">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </section>
        </header>

        <div className="lg:sticky lg:top-28">{body}</div>
      </div>
    </Layout>
  );
};
