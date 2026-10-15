import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'mg-assistant-v1';
const SUGGESTIONS = [
  '¿Cómo ingreso los goles de un partido?',
  '¿Cómo programo una fecha completa?',
  '¿Cómo configuro los cobros de la liga?',
  '¿Cómo nombro un encargado de turno?',
];

const load = (): Turn[] => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Turn[]).slice(-20) : [];
  } catch {
    return [];
  }
};
const save = (turns: Turn[]) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-20)));
  } catch {
    /* almacenamiento no disponible: la conversación vive solo en memoria */
  }
};

/** Markdown mínimo y seguro: **negrita**, [texto](/ruta interna) y saltos de línea. */
const renderInline = (line: string, key: string): ReactNode[] =>
  line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={`${key}-${i}`}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2];
      // Solo enlaces internos de MedioGol
      if (href.startsWith('/') && !href.startsWith('//')) {
        return (
          <a key={`${key}-${i}`} href={href} className="font-bold text-mg-pitch underline underline-offset-2">
            {link[1]}
          </a>
        );
      }
      return <span key={`${key}-${i}`}>{link[1]}</span>;
    }
    return <span key={`${key}-${i}`}>{part}</span>;
  });

const renderAnswer = (text: string) =>
  text.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    const bullet = trimmed.match(/^(\d+[.)]|[-•*])\s+(.*)$/);
    if (bullet) {
      return (
        <div key={i} className="flex gap-2">
          <span className="font-bold text-mg-pitch-deep flex-none">{/^\d/.test(bullet[1]) ? bullet[1] : '•'}</span>
          <span>{renderInline(bullet[2], `l${i}`)}</span>
        </div>
      );
    }
    const heading = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (heading) return <p key={i} className="font-extrabold">{heading[1]}</p>;
    return <p key={i}>{renderInline(trimmed, `l${i}`)}</p>;
  });

/**
 * Asistente del administrador: panel lateral tipo chat que explica cómo usar MedioGol.
 * Responde la Edge Function admin-assistant (Claude + guía de MedioGol). No ejecuta acciones.
 */
export const AdminAssistant = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [turns, setTurns] = useState<Turn[]>(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    save(turns);
  }, [turns]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Llaves a propósito: en Chrome reciente scrollIntoView devuelve una Promise y React la
  // trataría como función de limpieza del efecto (pantalla en blanco).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy, open]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q.slice(0, 800) }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('admin-assistant', {
      body: { messages: next.slice(-10), page: window.location.pathname + window.location.search },
    });
    setBusy(false);
    if (fnError || !data?.answer) {
      const detail = await (fnError as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setError(detail?.error || 'El asistente no pudo responder. Intenta de nuevo.');
      return;
    }
    setTurns([...next, { role: 'assistant', content: data.answer as string }]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] font-sans text-mg-ink" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      <button type="button" aria-label="Cerrar asistente" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <section className="absolute inset-y-0 right-0 w-full sm:w-[420px] bg-mg-bg shadow-2xl flex flex-col">
        <header className="bg-mg-navy text-mg-on-navy px-4 py-3 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-mg-lime" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="assistant-title" className="font-display text-xl font-extrabold uppercase leading-6">Asistente MedioGol</h2>
            <p className="text-xs text-mg-on-navy-muted">Pregúntame cómo hacer algo en la plataforma</p>
          </div>
          {turns.length > 0 && (
            <button type="button" onClick={() => { setTurns([]); setError(null); }} className="h-11 w-11 inline-flex items-center justify-center rounded-mg-md hover:bg-white/10" aria-label="Nueva conversación" title="Nueva conversación">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onClose} className="h-11 w-11 inline-flex items-center justify-center rounded-mg-md hover:bg-white/10" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
          {turns.length === 0 && (
            <div className="space-y-3">
              <div className="bg-mg-surface border border-mg-line rounded-mg-lg p-4 text-sm">
                ¡Hola! Te explico paso a paso cómo hacer cualquier cosa en MedioGol: ingresar resultados y goles, programar fechas, papeletas, sanciones, pagos y más.
              </div>
              <p className="mg-label text-mg-muted">Por ejemplo</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="text-left min-h-[44px] px-3 py-2 rounded-mg-md border border-mg-line bg-mg-surface text-sm font-bold hover:border-mg-pitch">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] bg-mg-pitch text-mg-on-pitch rounded-mg-lg rounded-br-sm px-3 py-2 text-sm whitespace-pre-line break-words">{t.content}</p>
              </div>
            ) : (
              <div key={i} className="max-w-[92%] bg-mg-surface border border-mg-line rounded-mg-lg rounded-bl-sm px-3 py-2 text-sm space-y-1 break-words">
                {renderAnswer(t.content)}
              </div>
            )
          )}
          {busy && (
            <p role="status" className="inline-flex items-center gap-2 text-sm text-mg-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Pensando…
            </p>
          )}
          {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="border-t border-mg-line bg-mg-surface p-3 flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">Tu pregunta</label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={2}
            maxLength={800}
            value={input}
            placeholder="Ej.: ¿cómo cambio la fecha de un partido?"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            className="flex-1 resize-none px-3 py-2 border border-mg-line-strong rounded-mg-md bg-mg-surface text-sm"
          />
          <button type="submit" disabled={busy || !input.trim()} className="h-11 w-11 inline-flex items-center justify-center rounded-mg-md bg-mg-pitch text-mg-on-pitch disabled:opacity-50" aria-label="Enviar">
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
        <p className="px-3 pb-2 bg-mg-surface text-[11px] text-mg-muted">Respuestas generadas con IA a partir de la guía de MedioGol. Puede equivocarse.</p>
      </section>
    </div>
  );
};
