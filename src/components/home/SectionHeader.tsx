import { ArrowRight } from 'lucide-react';

interface Props {
  id: string;
  title: string;
  href?: string;
  linkText?: string;
}

/** Título de sección del Inicio con enlace opcional "Ver todos". */
export const SectionHeader = ({ id, title, href, linkText }: Props) => (
  <div className="flex items-end justify-between gap-4 mb-4">
    <h2 id={id} className="text-[22px] leading-7 font-extrabold text-mg-ink">
      {title}
    </h2>
    {href && linkText && (
      <a href={href} className="inline-flex items-center gap-1 text-sm font-bold text-mg-pitch hover:underline">
        {linkText}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
  </div>
);
