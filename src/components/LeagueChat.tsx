import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, MessageCircle, Send, User, X } from 'lucide-react';
import { buildLeagueAnswer, LEAGUE_SUGGESTIONS, LeagueChatData } from '../utils/leagueChatEngine';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// Markdown mínimo: **negrita**, _cursiva_ y saltos de línea
const renderText = (text: string) =>
  text.split('\n').map((line, i, all) => {
    const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={j}>{p.slice(2, -2)}</strong>
          ) : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? (
            <em key={j} className="text-gray-500">{p.slice(1, -1)}</em>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
        {i < all.length - 1 && <br />}
      </span>
    );
  });

/**
 * Asistente flotante de la liga. Responde con los datos que la página de la liga ya cargó
 * (tabla general, series, encuentros, pendientes), sin consultas extra.
 */
export const LeagueChat = ({ data }: { data: LeagueChatData | null }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && data && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `¡Hola! 👋 Soy el asistente de la **${data.league.name}${data.league.season ? ` ${data.league.season}` : ''}**.\n\nPregúntame por la tabla general, cualquier serie, cómo va tu club, resultados, próximos partidos o pendientes.`,
        },
      ]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, data, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const send = async (text: string) => {
    if (!text.trim() || typing || !data) return;
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: text.trim() }]);
    setInput('');
    setTyping(true);
    await new Promise((r) => setTimeout(r, 350));
    let answer: string;
    try {
      answer = buildLeagueAnswer(text, data);
    } catch (e) {
      console.error('League chat error:', e);
      answer = 'Tuve un problema al buscar esa información. Intenta preguntarlo de otra forma.';
    }
    setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: answer }]);
    setTyping(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar asistente de la liga' : 'Abrir asistente de la liga'}
        className="fixed bottom-6 right-6 z-50 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        title="Asistente de la liga"
      >
        {open ? <ChevronDown className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Asistente de la liga"
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          style={{ height: '560px', maxHeight: 'calc(100vh - 120px)' }}
        >
          <div className="bg-emerald-950 rounded-t-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-emerald-950" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">Asistente de la Liga</p>
                <p className="text-emerald-200 text-xs truncate">{data?.league.name || 'Cargando…'}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar" className="text-white/80 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {!data ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${m.role === 'assistant' ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                      {m.role === 'assistant' ? <Bot className="h-4 w-4 text-emerald-700" /> : <User className="h-4 w-4 text-gray-500" />}
                    </div>
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        m.role === 'assistant' ? 'bg-gray-100 text-gray-800 rounded-tl-sm' : 'bg-emerald-600 text-white rounded-tr-sm'
                      }`}
                    >
                      {renderText(m.text)}
                    </div>
                  </div>
                ))}

                {messages.length === 1 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-gray-500 font-medium px-1">Preguntas frecuentes:</p>
                    {LEAGUE_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {typing && (
                  <div className="flex gap-2" aria-live="polite">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-emerald-100">
                      <Bot className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          <form
            className="border-t border-gray-100 px-3 py-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="league-chat-input" className="sr-only">Escribe tu pregunta</label>
            <input
              id="league-chat-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej: ¿cómo va Huracán?"
              disabled={!data || typing}
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!input.trim() || typing || !data}
              aria-label="Enviar"
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl w-9 h-9 flex items-center justify-center flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
