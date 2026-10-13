import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  AiSheetResult,
  MatchSheetContext,
  ReviewRow,
  ReviewState,
  Side,
  buildReview,
  goalsFromRows,
  prepareImage,
  toPayload,
} from '../utils/matchSheet';

const MAX_PHOTOS = 3;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface Photo {
  blob: Blob;
  url: string;
  qrMatchId: string | null;
}

/** Busca el QR de MedioGol en la foto (para avisar si es la papeleta de otro partido). */
const readQrMatchId = async (blob: Blob): Promise<string | null> => {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    const m = code?.data.match(UUID_RE);
    return m ? m[0].toLowerCase() : null;
  } catch {
    return null;
  }
};

type Step = 'loading' | 'denied' | 'capture' | 'reading' | 'review' | 'saving' | 'done';

/**
 * Subir la foto de una papeleta, revisar lo que leyó la IA y confirmar.
 * Se llega desde Administrar → Partidos o escaneando el QR impreso en la papeleta.
 */
export const MatchSheetUpload = () => {
  const { profile, loading: authLoading } = useAuth();
  const matchId = (window.location.pathname.match(UUID_RE)?.[0] || '').toLowerCase();
  const [ctx, setCtx] = useState<MatchSheetContext | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile || !matchId) {
      setStep('denied');
      return;
    }
    const controller = new AbortController();
    supabase
      .rpc('match_sheet_contexts', { p_match_ids: [matchId] })
      .abortSignal(controller.signal)
      .then(({ data, error: rpcError }) => {
        if (controller.signal.aborted) return;
        const c = (data?.[0] ?? null) as MatchSheetContext | null;
        if (rpcError || !c) {
          setStep('denied');
          return;
        }
        setCtx(c);
        setStep('capture');
      });
    return () => controller.abort();
  }, [profile?.id, authLoading, matchId]);

  // Libera las vistas previas al salir de la página
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.url);
    setPhotos((prev) => prev.filter((x) => x !== photo));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const next: Photo[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const blob = await prepareImage(file);
        next.push({ blob, url: URL.createObjectURL(blob), qrMatchId: await readQrMatchId(blob) });
      } catch {
        setError('No pudimos abrir una de las fotos. Usa JPG o PNG.');
      }
    }
    setPhotos((prev) => [...prev, ...next]);
  };

  const wrongSheet = photos.some((p) => p.qrMatchId && p.qrMatchId !== matchId);

  const readSheet = async () => {
    if (!ctx || !photos.length) return;
    setStep('reading');
    setError(null);
    try {
      const paths: string[] = [];
      for (const photo of photos) {
        const path = `${matchId}/${crypto.randomUUID()}.jpg`;
        const { error: upError } = await supabase.storage.from('match-sheets').upload(path, photo.blob, { contentType: 'image/jpeg' });
        if (upError) throw new Error('No se pudo subir la foto.');
        paths.push(path);
      }
      const { data, error: fnError } = await supabase.functions.invoke('read-match-sheet', { body: { match_id: matchId, paths } });
      if (fnError) {
        const detail = await (fnError as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error || 'No se pudo leer la papeleta.');
      }
      setSheetId(data.sheet_id);
      setReview(buildReview(ctx, data.result as AiSheetResult));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la papeleta.');
      setStep('capture');
    }
  };

  const updateRow = (key: string, patch: Partial<ReviewRow>) =>
    setReview((r) => (r ? { ...r, rows: r.rows.map((row) => (row.key === key ? { ...row, ...patch, flagged: false } : row)) } : r));

  const addRow = (side: Side) =>
    setReview((r) =>
      r
        ? {
            ...r,
            rows: [
              ...r.rows,
              { key: `${side}-new-${Date.now()}`, side, row: 99, player_id: null, name: '', jersey: '', played: true, goals: 0, yellow: false, red: false, flagged: false, reason: null },
            ],
          }
        : r
    );

  const removeRow = (key: string) => setReview((r) => (r ? { ...r, rows: r.rows.filter((row) => row.key !== key) } : r));

  const totals = useMemo(() => (review ? { home: goalsFromRows(review, 'home'), away: goalsFromRows(review, 'away') } : null), [review]);
  const scoreValid = !!review && /^\d{1,2}$/.test(review.homeScore) && /^\d{1,2}$/.test(review.awayScore);
  const scoreMismatch = !!review && !!totals && scoreValid && (totals.home !== Number(review.homeScore) || totals.away !== Number(review.awayScore));
  const pending = review ? review.rows.filter((r) => r.flagged).length + (review.scoreFlagged ? 1 : 0) : 0;

  const confirm = async () => {
    if (!review || !sheetId || !scoreValid) return;
    setStep('saving');
    setError(null);
    const { error: applyError } = await supabase.rpc('apply_match_sheet', { p_sheet_id: sheetId, p_payload: toPayload(review) });
    if (applyError) {
      setError(applyError.message || 'No se pudo guardar.');
      setStep('review');
      return;
    }
    setStep('done');
  };

  const discard = async () => {
    if (sheetId) await supabase.rpc('discard_match_sheet', { p_sheet_id: sheetId });
    setSheetId(null);
    setReview(null);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setStep('capture');
  };

  const teamName = (side: Side) => (side === 'home' ? ctx?.home.name : ctx?.away.name) ?? '';
  const rosterOf = (side: Side) => (side === 'home' ? ctx?.home.roster : ctx?.away.roster) ?? [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 font-sans text-mg-ink">
        {step === 'loading' && <p className="py-16 text-center text-mg-muted" role="status">Cargando partido…</p>}

        {step === 'denied' && (
          <div role="alert" className="bg-mg-surface border border-mg-line rounded-mg-lg p-8 text-center">
            <p className="font-bold mb-1">No puedes subir la papeleta de este partido.</p>
            <p className="text-mg-muted text-sm">Inicia sesión con una cuenta que administre el campeonato o sea encargada de turno.</p>
          </div>
        )}

        {ctx && step !== 'loading' && step !== 'denied' && (
          <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg px-6 py-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[14rem]">
              <p className="mg-label text-mg-on-navy-muted">
                {[ctx.league, ctx.series || ctx.championship, ctx.round ? `Fecha ${ctx.round}` : null].filter(Boolean).join(' · ')}
              </p>
              <h1 className="font-display text-[30px] leading-8 font-extrabold uppercase">
                {ctx.home.name} vs {ctx.away.name}
              </h1>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-mg-pitch-tint text-mg-ink text-sm font-extrabold">{ctx.code}</span>
          </header>
        )}

        {error && (
          <p role="alert" className="bg-mg-danger-tint text-mg-danger rounded-mg-md px-4 py-3 font-semibold">
            {error}
          </p>
        )}

        {ctx && (step === 'capture' || step === 'reading') && (
          <section aria-labelledby="capture-title" className="bg-mg-surface border border-mg-line rounded-mg-lg p-6 space-y-5">
            <div>
              <h2 id="capture-title" className="text-[22px] font-extrabold">Sube la foto de la papeleta</h2>
              <p className="text-mg-muted text-sm">Hoja completa, de frente y con buena luz, con las 4 esquinas ■ a la vista. Hasta {MAX_PHOTOS} fotos si usaste más de una hoja.</p>
            </div>
            {ctx.status === 'finished' && (
              <p className="flex gap-2 items-start bg-[#fff4d6] border border-[#e0b84a] rounded-mg-md px-4 py-3 text-sm">
                <AlertTriangle className="h-5 w-5 flex-none text-mg-gold-ink" aria-hidden="true" />
                Este partido ya tiene resultado. Al confirmar la papeleta, se reemplazan el resultado, los goles y las tarjetas registrados.
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              {photos.map((p, i) => (
                <figure key={p.url} className="relative w-40">
                  <img src={p.url} alt={`Foto ${i + 1} de la papeleta`} className="w-40 h-52 object-cover rounded-mg-md border border-mg-line" />
                  <button
                    type="button"
                    onClick={() => removePhoto(p)}
                    disabled={step === 'reading'}
                    aria-label={`Quitar foto ${i + 1}`}
                    className="absolute top-1 right-1 p-1.5 rounded-full bg-mg-surface shadow-mg-card"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {p.qrMatchId && (
                    <figcaption className={`mt-1 text-xs font-bold ${p.qrMatchId === matchId ? 'text-mg-pitch' : 'text-mg-danger'}`}>
                      {p.qrMatchId === matchId ? 'QR de este partido' : 'QR de OTRO partido'}
                    </figcaption>
                  )}
                </figure>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="w-40 h-52 rounded-mg-md border-2 border-dashed border-mg-line-strong flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-mg-surface-2 focus-within:outline focus-within:outline-2 focus-within:outline-mg-focus">
                  <Camera className="h-7 w-7 text-mg-muted" aria-hidden="true" />
                  <span className="font-bold text-sm">Tomar o elegir foto</span>
                  <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                </label>
              )}
            </div>
            {wrongSheet && (
              <p role="alert" className="text-mg-danger font-semibold text-sm">
                Una foto tiene el QR de otro partido. Revisa que sea la papeleta correcta antes de continuar.
              </p>
            )}
            <button
              type="button"
              onClick={readSheet}
              disabled={!photos.length || step === 'reading'}
              className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold disabled:opacity-50"
            >
              {step === 'reading' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
              {step === 'reading' ? 'Leyendo la papeleta… (10 a 30 segundos)' : 'Leer papeleta'}
            </button>
          </section>
        )}

        {ctx && review && (step === 'review' || step === 'saving') && (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-3">
              {photos.map((p, i) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block">
                  <img src={p.url} alt={`Foto ${i + 1} de la papeleta (abrir en grande)`} className="w-full rounded-mg-md border border-mg-line" />
                </a>
              ))}
              <p className="text-xs text-mg-muted">Toca la foto para verla en grande.</p>
            </aside>

            <section aria-labelledby="review-title" className="space-y-4 min-w-0">
              <h2 id="review-title" className="text-[22px] font-extrabold">Revisa antes de guardar</h2>

              {(review.warnings.length > 0 || pending > 0) && (
                <div role="status" className="bg-[#fff4d6] border border-[#e0b84a] rounded-mg-md px-4 py-3 text-sm space-y-1">
                  {pending > 0 && <p className="font-bold">{pending} {pending === 1 ? 'dato necesita' : 'datos necesitan'} tu revisión (en amarillo).</p>}
                  {review.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}

              <div className={`rounded-mg-lg border p-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 ${review.scoreFlagged ? 'bg-[#fff4d6] border-[#e0b84a]' : 'bg-mg-surface border-mg-line'}`}>
                <span className="font-extrabold">{ctx.home.name}</span>
                <span className="flex items-center gap-2">
                  <input
                    aria-label={`Goles ${ctx.home.name}`}
                    inputMode="numeric"
                    value={review.homeScore}
                    onChange={(e) => setReview({ ...review, homeScore: e.target.value.replace(/\D/g, '').slice(0, 2), scoreFlagged: false })}
                    className="w-16 h-14 text-center mg-num text-[32px] font-extrabold border border-mg-line-strong rounded-mg-md"
                  />
                  <span className="mg-num text-2xl font-extrabold">–</span>
                  <input
                    aria-label={`Goles ${ctx.away.name}`}
                    inputMode="numeric"
                    value={review.awayScore}
                    onChange={(e) => setReview({ ...review, awayScore: e.target.value.replace(/\D/g, '').slice(0, 2), scoreFlagged: false })}
                    className="w-16 h-14 text-center mg-num text-[32px] font-extrabold border border-mg-line-strong rounded-mg-md"
                  />
                </span>
                <span className="font-extrabold text-right">{ctx.away.name}</span>
                {(review.scoreReason || scoreMismatch) && (
                  <p className="col-span-3 text-sm text-mg-gold-ink font-semibold">
                    {scoreMismatch && totals ? `Los goles registrados abajo suman ${totals.home}–${totals.away}. ` : ''}
                    {review.scoreFlagged ? review.scoreReason : ''}
                  </p>
                )}
              </div>

              {(['home', 'away'] as Side[]).map((side) => (
                <div key={side} className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-mg-line flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-extrabold">{teamName(side)}</h3>
                    <label className="text-sm flex items-center gap-2">
                      Autogoles del rival a favor
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={review.ownGoals[side]}
                        onChange={(e) => setReview({ ...review, ownGoals: { ...review.ownGoals, [side]: Math.max(0, Number(e.target.value) || 0) } })}
                        className="w-16 h-9 px-2 border border-mg-line-strong rounded-mg-md"
                      />
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="bg-mg-surface-2 text-xs uppercase tracking-wide text-mg-muted">
                          <th scope="col" className="px-3 py-2 text-left">Jugador</th>
                          <th scope="col" className="px-2 py-2">N°</th>
                          <th scope="col" className="px-2 py-2">Jugó</th>
                          <th scope="col" className="px-2 py-2">Goles</th>
                          <th scope="col" className="px-2 py-2">TA</th>
                          <th scope="col" className="px-2 py-2">TR</th>
                          <th scope="col" className="px-2 py-2"><span className="sr-only">Quitar</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {review.rows
                          .filter((r) => r.side === side)
                          .map((r) => (
                            <tr key={r.key} className={`border-t border-mg-line ${r.flagged ? 'bg-[#fff4d6]' : ''}`}>
                              <td className="px-3 py-2">
                                {r.player_id ? (
                                  <span className="font-bold">{r.name}</span>
                                ) : (
                                  <select
                                    aria-label="Jugador"
                                    value=""
                                    onChange={(e) => {
                                      const p = rosterOf(side).find((x) => x.player_id === e.target.value);
                                      if (p) updateRow(r.key, { player_id: p.player_id, name: p.name });
                                    }}
                                    className="mb-1 w-full h-8 px-2 border border-mg-line-strong rounded-mg-md text-xs"
                                  >
                                    <option value="">Asociar a jugador de la nómina…</option>
                                    {rosterOf(side).map((p) => (
                                      <option key={p.player_id} value={p.player_id}>{p.name}</option>
                                    ))}
                                  </select>
                                )}
                                {!r.player_id && (
                                  <input
                                    aria-label="Nombre escrito"
                                    value={r.name}
                                    placeholder="Nombre (no está en la nómina)"
                                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                                    className="w-full h-8 px-2 border border-mg-line-strong rounded-mg-md"
                                  />
                                )}
                                {r.flagged && r.reason && <p className="text-xs text-mg-gold-ink font-semibold mt-1">{r.reason}</p>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  aria-label={`N° de ${r.name || 'jugador'}`}
                                  value={r.jersey}
                                  onChange={(e) => updateRow(r.key, { jersey: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                                  className="w-12 h-8 text-center border border-mg-line-strong rounded-mg-md"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input type="checkbox" aria-label={`${r.name || 'Jugador'} jugó`} checked={r.played} onChange={(e) => updateRow(r.key, { played: e.target.checked })} className="h-5 w-5" />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={9}
                                  aria-label={`Goles de ${r.name || 'jugador'}`}
                                  value={r.goals}
                                  onChange={(e) => updateRow(r.key, { goals: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })}
                                  className="w-14 h-8 text-center border border-mg-line-strong rounded-mg-md"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input type="checkbox" aria-label={`Amarilla a ${r.name || 'jugador'}`} checked={r.yellow} onChange={(e) => updateRow(r.key, { yellow: e.target.checked })} className="h-5 w-5" />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input type="checkbox" aria-label={`Roja a ${r.name || 'jugador'}`} checked={r.red} onChange={(e) => updateRow(r.key, { red: e.target.checked })} className="h-5 w-5" />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button type="button" onClick={() => removeRow(r.key)} aria-label={`Quitar ${r.name || 'fila'}`} className="p-1.5 rounded-mg-md hover:bg-mg-surface-2">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-mg-line">
                    <button type="button" onClick={() => addRow(side)} className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-bold text-mg-pitch">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Agregar jugador que faltó leer
                    </button>
                  </div>
                </div>
              ))}

              <label className="block bg-mg-surface border border-mg-line rounded-mg-lg p-4">
                <span className="mg-label text-mg-muted">Observaciones leídas</span>
                <textarea value={review.notes} onChange={(e) => setReview({ ...review, notes: e.target.value })} rows={2} className="mt-2 w-full p-2 border border-mg-line-strong rounded-mg-md" />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 min-w-[16rem] text-sm text-mg-muted">
                  Nada se guarda hasta que confirmes. Al confirmar se actualizan el resultado, la tabla, los goleadores y quiénes jugaron; la foto queda como respaldo.
                </p>
                <button type="button" onClick={discard} disabled={step === 'saving'} className="min-h-[48px] px-5 rounded-mg-md border border-mg-line-strong bg-mg-surface font-extrabold">
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!scoreValid || step === 'saving'}
                  className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold disabled:opacity-50"
                >
                  {step === 'saving' && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                  Confirmar y guardar
                </button>
              </div>
            </section>
          </div>
        )}

        {ctx && step === 'done' && review && (
          <section className="bg-mg-surface border border-mg-line rounded-mg-lg p-8 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-mg-pitch" aria-hidden="true" />
            <h2 className="text-[22px] font-extrabold">Papeleta guardada</h2>
            <p className="mg-num text-[32px] font-extrabold">
              {ctx.home.name} {review.homeScore} – {review.awayScore} {ctx.away.name}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a href={`/championship/${ctx.championship_id}`} className="inline-flex items-center min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong font-extrabold text-sm">
                Ver campeonato
              </a>
              <a href="/admin" className="inline-flex items-center min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm">
                Volver a Administrar
              </a>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};
