import { ReactNode } from 'react';
import { Layout } from '../Layout';

/** Tarjeta centrada para pantallas de cuenta (recuperar y restablecer contraseña). */
export const AuthCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) => (
  <Layout>
    <div className="min-h-[70vh] flex items-center justify-center font-sans text-mg-ink">
      <div className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card w-full max-w-md p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">{title}</h1>
          {subtitle && <p className="text-mg-muted mt-2">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  </Layout>
);

export const authInput =
  'w-full min-h-[48px] px-4 border border-mg-line-strong rounded-mg-md bg-mg-surface text-mg-ink focus:outline-none focus:ring-2 focus:ring-mg-focus';
export const authButton =
  'w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold disabled:opacity-50';
