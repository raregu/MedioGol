import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2, Megaphone, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import { LeaguePost, LeaguePostInput, useLeaguePosts } from '../../hooks/useLeaguePosts';
import { LeagueNoticeKind } from '../../types/home';
import { NOTICE_KINDS, noticeKind, timeAgo } from './noticeMeta';

const KIND_ORDER: LeagueNoticeKind[] = ['suspension', 'horario', 'aviso'];
const PLACEHOLDER: Record<LeagueNoticeKind, string> = {
  suspension: 'Ej.: Fecha 11 suspendida por lluvia',
  horario: 'Ej.: Serie Dorados juega a las 10:00 en Lagunillas',
  aviso: 'Ej.: Inscripciones para la próxima temporada abiertas',
};

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
/** Fin del día elegido, en la hora local del organizador. */
const fromDateInput = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
const isExpired = (p: LeaguePost) => !!p.expires_at && new Date(p.expires_at).getTime() < Date.now();

const empty: LeaguePostInput = { kind: 'suspension', title: '', body: '', pinned: false, expires_at: null };

const PostForm = ({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: LeaguePostInput;
  onSubmit: (v: LeaguePostInput) => Promise<string | null>;
  onCancel: () => void;
  submitLabel: string;
}) => {
  const [v, setV] = useState<LeaguePostInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const title = v.title.trim();
    if (title.length < 3) {
      setError('Escribe un título de al menos 3 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSubmit({ ...v, title, body: v.body.trim() });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-mg-lg border border-mg-line bg-mg-surface-2 p-4">
      <fieldset>
        <legend className="text-sm font-extrabold text-mg-ink mb-2">Tipo de aviso</legend>
        <div className="flex flex-wrap gap-2">
          {KIND_ORDER.map((k) => {
            const m = NOTICE_KINDS[k];
            const on = v.kind === k;
            return (
              <label
                key={k}
                className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-sm font-bold cursor-pointer ${
                  on ? 'border-mg-navy bg-mg-navy text-mg-on-navy' : 'border-mg-line-strong bg-mg-surface text-mg-ink hover:border-mg-navy'
                }`}
              >
                <input type="radio" name="kind" value={k} checked={on} onChange={() => setV({ ...v, kind: k })} className="sr-only" />
                <m.Icon className="h-4 w-4" aria-hidden="true" />
                {m.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="post-title" className="block text-sm font-extrabold text-mg-ink mb-1">
          Título
        </label>
        <input
          ref={titleRef}
          id="post-title"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          maxLength={120}
          required
          placeholder={PLACEHOLDER[v.kind]}
          className="w-full min-h-[44px] rounded-mg-md border border-mg-line-strong bg-mg-surface px-3 text-mg-ink focus:outline-none focus:ring-2 focus:ring-mg-focus"
        />
      </div>
      <div>
        <label htmlFor="post-body" className="block text-sm font-extrabold text-mg-ink mb-1">
          Detalle <span className="font-semibold text-mg-muted">(opcional)</span>
        </label>
        <textarea
          id="post-body"
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="Motivo, nueva fecha, cancha, etc."
          className="w-full rounded-mg-md border border-mg-line-strong bg-mg-surface px-3 py-2 text-mg-ink focus:outline-none focus:ring-2 focus:ring-mg-focus"
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-bold text-mg-ink cursor-pointer">
          <input type="checkbox" checked={v.pinned} onChange={(e) => setV({ ...v, pinned: e.target.checked })} className="h-5 w-5 accent-[var(--mg-pitch)]" />
          Fijar arriba
        </label>
        <div>
          <label htmlFor="post-expires" className="block text-sm font-extrabold text-mg-ink mb-1">
            Destacado hasta <span className="font-semibold text-mg-muted">(opcional)</span>
          </label>
          <input
            id="post-expires"
            type="date"
            value={toDateInput(v.expires_at)}
            min={new Date().toLocaleDateString('sv-SE')}
            onChange={(e) => setV({ ...v, expires_at: fromDateInput(e.target.value) })}
            className="min-h-[44px] rounded-mg-md border border-mg-line-strong bg-mg-surface px-3 text-mg-ink"
          />
        </div>
      </div>
      <p className="text-xs text-mg-muted">
        El aviso se destaca en la tarjeta de la liga, en sus series y a quienes la siguen durante 7 días (o hasta la fecha que elijas). Si lo fijas, se
        mantiene arriba hasta que lo quites.
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-mg-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong text-sm font-bold text-mg-ink">
          Cancelar
        </button>
      </div>
    </form>
  );
};

const PostItem = ({
  post,
  canManage,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  post: LeaguePost;
  canManage: boolean;
  onEdit: () => void;
  onTogglePin: () => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}) => {
  const meta = noticeKind(post.kind);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
  };
  const expired = isExpired(post);
  const edited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 60_000;

  return (
    <li className={`border-l-4 rounded-r-mg-md px-4 py-3 ${meta.bar} ${expired ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-extrabold ${meta.chip}`}>
          <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {meta.label}
        </span>
        {post.pinned && (
          <span className="inline-flex items-center gap-1 font-extrabold text-mg-ink">
            <Pin className="h-3.5 w-3.5" aria-hidden="true" /> Fijado
          </span>
        )}
        {expired && <span className="font-bold text-mg-muted">Ya no se destaca</span>}
        <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('es-CL')} className="text-mg-muted font-semibold">
          {timeAgo(post.created_at)}
          {edited ? ' · editado' : ''}
        </time>
      </div>
      <h3 className="mt-1 font-extrabold text-mg-ink break-words">{post.title}</h3>
      {post.body && <p className="mt-1 text-sm text-mg-ink/85 whitespace-pre-line break-words">{post.body}</p>}
      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" onClick={onEdit} disabled={busy} className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-mg-md text-xs font-bold text-mg-ink hover:bg-black/5">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
          </button>
          <button type="button" onClick={() => run(onTogglePin)} disabled={busy} className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-mg-md text-xs font-bold text-mg-ink hover:bg-black/5">
            {post.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
            {post.pinned ? 'Desfijar' : 'Fijar'}
          </button>
          {confirm ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-xs font-bold text-mg-danger">¿Borrar este aviso?</span>
              <button type="button" onClick={() => run(onDelete)} disabled={busy} className="min-h-[36px] px-3 rounded-mg-md text-xs font-extrabold bg-mg-danger text-white">
                Sí, borrar
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="min-h-[36px] px-2 rounded-mg-md text-xs font-bold text-mg-ink hover:bg-black/5" aria-label="No borrar">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} disabled={busy} className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-mg-md text-xs font-bold text-mg-danger hover:bg-black/5">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Borrar
            </button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-mg-muted" aria-hidden="true" />}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-mg-danger">
          {error}
        </p>
      )}
    </li>
  );
};

/**
 * Muro de avisos de una liga. Todos lo leen; el organizador publica, edita, fija y borra.
 * Si la liga no tiene avisos y quien mira no la administra, no ocupa espacio.
 */
export const LeagueWall = ({ leagueId, canManage }: { leagueId: string; canManage: boolean }) => {
  const { posts, status, hasMore, loadMore, create, update, remove } = useLeaguePosts(leagueId);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);

  // Enlaces "/league/:id#muro": la página se arma después de cargar, así que el salto se hace aquí
  useEffect(() => {
    if (status === 'ready' && !scrolled.current && window.location.hash === '#muro') {
      scrolled.current = true;
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status]);

  if (status === 'unavailable' || status === 'loading') return null;
  if (posts.length === 0 && !canManage) return null;

  return (
    <section ref={sectionRef} id="muro" aria-labelledby="muro-title" className="scroll-mt-20 bg-mg-surface rounded-xl border border-mg-line shadow-sm p-5 space-y-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="muro-title" className="text-xl font-black text-mg-ink flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-mg-pitch-deep" aria-hidden="true" /> Muro de la liga
          </h2>
          <p className="text-sm text-mg-muted">Avisos del organizador: suspensiones, cambios de horario y novedades.</p>
        </div>
        {canManage && !composing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setComposing(true);
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Publicar aviso
          </button>
        )}
      </div>

      {composing && (
        <PostForm
          initial={empty}
          submitLabel="Publicar"
          onCancel={() => setComposing(false)}
          onSubmit={async (v) => {
            const err = await create(v);
            if (!err) setComposing(false);
            return err;
          }}
        />
      )}

      {posts.length === 0 ? (
        !composing && <p className="text-sm text-mg-muted">Aún no hay avisos. Publica el primero, por ejemplo si se suspende una fecha.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) =>
            editing === p.id ? (
              <li key={p.id}>
                <PostForm
                  initial={{ kind: p.kind, title: p.title, body: p.body ?? '', pinned: p.pinned, expires_at: p.expires_at }}
                  submitLabel="Guardar"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    const err = await update(p.id, v);
                    if (!err) setEditing(null);
                    return err;
                  }}
                />
              </li>
            ) : (
              <PostItem
                key={p.id}
                post={p}
                canManage={canManage}
                onEdit={() => {
                  setComposing(false);
                  setEditing(p.id);
                }}
                onTogglePin={() => update(p.id, { pinned: !p.pinned })}
                onDelete={() => remove(p.id)}
              />
            )
          )}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await loadMore();
            setLoadingMore(false);
          }}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong text-sm font-bold text-mg-ink disabled:opacity-60"
        >
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Ver avisos anteriores
        </button>
      )}
    </section>
  );
};
