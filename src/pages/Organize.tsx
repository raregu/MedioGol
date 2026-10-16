import { ReactNode, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, ClipboardList, QrCode, Wallet } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useMyOrganizerRequest } from '../hooks/useOrganizerRequests';
import { OrganizerWizard } from '../components/organizer/OrganizerWizard';
import { OrganizerApproved, OrganizerRequestStatus } from '../components/organizer/OrganizerRequestStatus';
import { primaryBtn, secondaryBtn } from '../components/payments/PaymentsUi';

const BENEFITS = [
  { icon: BarChart3, title: 'Tabla y goleadores al día', text: 'Se calculan solos al cargar cada resultado.' },
  { icon: CalendarDays, title: 'Fixture y resultados', text: 'Fechas, horarios y canchas a la vista de todos.' },
  { icon: ClipboardList, title: 'Papeletas digitales', text: 'Goles, tarjetas y observaciones de cada partido.' },
  { icon: Wallet, title: 'Pagos de los equipos', text: 'Inscripciones, arbitrajes y multas en orden.' },
  { icon: QrCode, title: 'Credenciales con QR', text: 'Validación de jugadores en la cancha.' },
];

const HOW = ['Cuéntanos de tu liga en 3 pasos (2 minutos).', 'Te contactamos por WhatsApp para conocerte.', 'Activamos tu cuenta y creas tu liga.'];

/** /organizar: pedir acceso de organizador (admin de campeonato) de forma guiada. */
export const Organize = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { status, request, reload } = useMyOrganizerRequest(user?.id);
  const [formOpen, setFormOpen] = useState(false);

  const isOrganizer = profile?.role === 'admin_campeonato' || profile?.role === 'admin_sistema';
  const approvedNow = request?.status === 'approved' && !isOrganizer;

  // Si la aprobaron y el perfil en memoria aún tiene el rol anterior, se renueva la sesión.
  useEffect(() => {
    if (approvedNow) refreshProfile().catch((e) => console.error('refreshProfile', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedNow]);

  useEffect(() => {
    document.title = 'Organiza tu liga · MedioGol';
  }, []);

  const showWizard = !!user && !isOrganizer && status === 'ready' && (!request || formOpen);
  const next = encodeURIComponent('/organizar');

  let body: ReactNode = null;
  if (loading || (user && (status === 'loading' || status === 'idle'))) {
    body = (
      <div className="flex justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mg-pitch" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  } else if (!user) {
    body = (
      <section aria-labelledby="org-login" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card p-5 sm:p-6 space-y-4">
        <h2 id="org-login" className="font-display text-2xl font-extrabold uppercase">
          Primero, entra con tu cuenta
        </h2>
        <p className="text-sm">La solicitud queda asociada a tu cuenta: con ella vas a administrar tu liga cuando la aprobemos.</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/register?next=${next}`} className={primaryBtn}>
            Crear cuenta gratis
          </a>
          <a href={`/login?next=${next}`} className={secondaryBtn}>
            Ya tengo cuenta
          </a>
        </div>
      </section>
    );
  } else if (status === 'error') {
    body = (
      <div role="alert" className="bg-mg-danger-tint rounded-mg-lg px-5 py-6 flex flex-wrap items-center justify-between gap-4">
        <p className="font-semibold">No pudimos revisar tu solicitud. Revisa tu conexión.</p>
        <button type="button" onClick={reload} className={primaryBtn}>
          Reintentar
        </button>
      </div>
    );
  } else if (isOrganizer || request?.status === 'approved') {
    body = <OrganizerApproved orgName={request?.status === 'approved' ? request.org_name : undefined} />;
  } else if (showWizard) {
    body = (
      <OrganizerWizard
        defaultName={profile?.full_name ?? ''}
        onSubmitted={() => {
          setFormOpen(false);
          reload();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  } else if (request) {
    body = <OrganizerRequestStatus request={request} onChanged={reload} onNewRequest={() => setFormOpen(true)} />;
  }

  return (
    <Layout>
      <div className="font-sans text-mg-ink grid gap-8 lg:grid-cols-[1fr_minmax(0,560px)] items-start">
        <header className="space-y-5">
          <p className="mg-label text-mg-pitch-deep">Para organizadores</p>
          <h1 className="font-display text-[40px] sm:text-[52px] leading-none font-extrabold uppercase">Organiza tu liga en MedioGol</h1>
          <p className="text-lg text-mg-muted max-w-prose">
            Si organizas una liga, un campeonato o administras un recinto, pide tu acceso y gestiona todo desde un solo lugar. Los jugadores y
            capitanes lo siguen desde el celular.
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
