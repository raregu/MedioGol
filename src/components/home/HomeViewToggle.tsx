import { Bell, LayoutGrid } from 'lucide-react';
import { HomeView } from '../../hooks/useHomeView';

const OPTIONS: { id: HomeView; label: string; Icon: typeof Bell }[] = [
  { id: 'following', label: 'Siguiendo', Icon: Bell },
  { id: 'all', label: 'Todo', Icon: LayoutGrid },
];

/** Selector del Inicio: solo lo que sigo o todo MedioGol. */
export const HomeViewToggle = ({ view, onChange }: { view: HomeView; onChange: (v: HomeView) => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div role="group" aria-label="Qué ver en el Inicio" className="inline-flex p-1 rounded-full bg-mg-surface-2 border border-mg-line">
      {OPTIONS.map(({ id, label, Icon }) => {
        const on = view === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => !on && onChange(id)}
            className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full text-sm font-extrabold transition-colors ${
              on ? 'bg-mg-navy text-mg-on-navy shadow-sm' : 'text-mg-muted hover:text-mg-ink'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
    <p className="text-sm text-mg-muted">{view === 'following' ? 'Solo las ligas y campeonatos que sigues.' : 'Todas las ligas y campeonatos de MedioGol.'}</p>
  </div>
);
