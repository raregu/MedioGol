import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Championship, League, LeagueAdjustment, LeaguePhase, LeagueStatus } from '../../types/database';
import { useDebounce } from '../../utils/useDebounce';
import { Plus, Trash2, X } from 'lucide-react';

interface Props {
  league?: League | null;
  onClose: () => void;
  onSaved: (leagueId: string) => void;
}

interface SeriesRow {
  championship: Championship;
  included: boolean;
  series_name: string;
  display_order: number;
}

type PhaseDraft = Pick<LeaguePhase, 'name' | 'round_from' | 'round_to' | 'is_default'> & { id?: string; tmp: string };
type AdjDraft = Pick<LeagueAdjustment, 'base_team_id' | 'points' | 'goal_difference' | 'reason'> & {
  id?: string;
  tmp: string;
  phase_ref: string; // id de fase guardada, tmp de fase nueva, o '' (todas)
};

const uid = () => Math.random().toString(36).slice(2);
const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
const label = 'block text-xs font-bold text-gray-700 mb-1';

export const LeagueManageModal = ({ league, onClose, onSaved }: Props) => {
  const { profile } = useAuth();
  const isEdit = !!league;
  const [form, setForm] = useState({
    name: league?.name || '',
    season: league?.season || String(new Date().getFullYear()),
    location: league?.location || '',
    description: league?.description || '',
    logo_url: league?.logo_url || '',
    facebook_page_url: league?.facebook_page_url || '',
    website_url: league?.website_url || '',
    status: (league?.status || 'active') as LeagueStatus,
    points_win: league?.points_win ?? 3,
    points_draw: league?.points_draw ?? 1,
    points_loss: league?.points_loss ?? 0,
  });
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>([]);
  const [phases, setPhases] = useState<PhaseDraft[]>([]);
  const [removedPhases, setRemovedPhases] = useState<string[]>([]);
  const [adjs, setAdjs] = useState<AdjDraft[]>([]);
  const [removedAdjs, setRemovedAdjs] = useState<string[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const debouncedFilter = useDebounce(filter.trim(), 300);

  // Series actuales de la liga
  useEffect(() => {
    const load = async () => {
      if (league) {
        const { data } = await supabase.from('championships').select('*').eq('league_id', league.id).order('display_order');
        setSeriesRows(
          ((data || []) as Championship[]).map((c) => ({
            championship: c,
            included: true,
            series_name: c.series_name || '',
            display_order: c.display_order ?? 0,
          }))
        );
      }

      if (league) {
        const [{ data: ph }, { data: ad }] = await Promise.all([
          supabase.from('league_phases').select('*').eq('league_id', league.id).order('display_order').order('round_from'),
          supabase.from('league_adjustments').select('*').eq('league_id', league.id).order('applied_on'),
        ]);
        setPhases(((ph || []) as LeaguePhase[]).map((p) => ({ ...p, tmp: p.id })));
        setAdjs(((ad || []) as LeagueAdjustment[]).map((a) => ({ ...a, tmp: a.id, phase_ref: a.phase_id || '' })));
      }
    };
    load();
  }, [league]);

  // Candidatos: campeonatos sin liga que administra el usuario, buscados en el servidor (máx. 20)
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('search_championships', {
        p_query: debouncedFilter || null,
        p_without_league: true,
        p_limit: 20,
        p_offset: 0,
      });
      const mine = ((data || []) as Championship[]).filter((c) => profile?.role === 'admin_sistema' || c.admin_id === profile?.id);
      setSeriesRows((rows) => {
        const keep = rows.filter((r) => r.included || r.championship.league_id === league?.id);
        const ids = new Set(keep.map((r) => r.championship.id));
        return [
          ...keep,
          ...mine
            .filter((c) => !ids.has(c.id))
            .map((c) => ({ championship: { ...c, league_id: null } as Championship, included: false, series_name: '', display_order: 0 })),
        ];
      });
    };
    load();
  }, [debouncedFilter, profile, league]);

  const includedIds = useMemo(() => seriesRows.filter((r) => r.included).map((r) => r.championship.id), [seriesRows]);

  useEffect(() => {
    const loadClubs = async () => {
      if (!includedIds.length) return setClubs([]);
      const { data } = await supabase
        .from('teams')
        .select('base_team_id, base_team:base_teams(id, name)')
        .in('championship_id', includedIds)
        .not('base_team_id', 'is', null);
      const map = new Map<string, string>();
      type Row = { base_team: { id: string; name: string } | { id: string; name: string }[] | null };
      ((data || []) as Row[]).forEach((t) => {
        const bt = Array.isArray(t.base_team) ? t.base_team[0] : t.base_team;
        if (bt) map.set(bt.id, bt.name.trim());
      });
      setClubs(Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    };
    loadClubs();
  }, [includedIds]);

  const updateSeries = (id: string, patch: Partial<SeriesRow>) =>
    setSeriesRows((rows) => rows.map((r) => (r.championship.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('La liga necesita un nombre.');
    for (const p of phases) {
      if (!p.name.trim() || p.round_from > p.round_to) return setError(`Revisa la rueda "${p.name || 'sin nombre'}": nombre y rango de fechas.`);
    }
    for (const a of adjs) {
      if (!a.base_team_id || !a.reason.trim()) return setError('Cada ajuste necesita club y motivo.');
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        season: form.season.trim() || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        logo_url: form.logo_url.trim() || null,
        facebook_page_url: form.facebook_page_url.trim() || null,
        website_url: form.website_url.trim() || null,
      };
      let leagueId = league?.id;
      if (leagueId) {
        const { error: e } = await supabase.from('leagues').update(payload).eq('id', leagueId);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('leagues').insert({ ...payload, admin_id: profile?.id }).select().single();
        if (e) throw e;
        leagueId = data.id;
      }

      // Series
      for (const r of seriesRows) {
        const wasIn = r.championship.league_id === leagueId;
        if (r.included) {
          const { error: e } = await supabase
            .from('championships')
            .update({ league_id: leagueId, series_name: r.series_name.trim() || null, display_order: r.display_order })
            .eq('id', r.championship.id);
          if (e) throw e;
        } else if (wasIn) {
          const { error: e } = await supabase.from('championships').update({ league_id: null }).eq('id', r.championship.id);
          if (e) throw e;
        }
      }

      // Ruedas
      if (removedPhases.length) {
        const { error: e } = await supabase.from('league_phases').delete().in('id', removedPhases);
        if (e) throw e;
      }
      const phaseIdByTmp = new Map<string, string>();
      for (const [i, p] of phases.entries()) {
        const row = { league_id: leagueId, name: p.name.trim(), round_from: p.round_from, round_to: p.round_to, is_default: p.is_default, display_order: i };
        if (p.id) {
          const { error: e } = await supabase.from('league_phases').update(row).eq('id', p.id);
          if (e) throw e;
          phaseIdByTmp.set(p.tmp, p.id);
        } else {
          const { data, error: e } = await supabase.from('league_phases').insert(row).select().single();
          if (e) throw e;
          phaseIdByTmp.set(p.tmp, data.id);
        }
      }

      // Ajustes
      if (removedAdjs.length) {
        const { error: e } = await supabase.from('league_adjustments').delete().in('id', removedAdjs);
        if (e) throw e;
      }
      for (const a of adjs) {
        const row = {
          league_id: leagueId,
          phase_id: a.phase_ref ? phaseIdByTmp.get(a.phase_ref) || null : null,
          base_team_id: a.base_team_id,
          points: a.points,
          goal_difference: a.goal_difference,
          reason: a.reason.trim(),
        };
        const { error: e } = a.id
          ? await supabase.from('league_adjustments').update(row).eq('id', a.id)
          : await supabase.from('league_adjustments').insert({ ...row, created_by: profile?.id });
        if (e) throw e;
      }

      onSaved(leagueId!);
    } catch (e) {
      console.error('Error saving league:', e);
      setError((e as { message?: string })?.message || 'No se pudo guardar la liga.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!league) return;
    if (!window.confirm(`¿Eliminar la liga "${league.name}"? Los campeonatos no se borran, solo dejan de estar agrupados.`)) return;
    setSaving(true);
    const { error: e } = await supabase.from('leagues').delete().eq('id', league.id);
    setSaving(false);
    if (e) return setError(e.message);
    window.history.pushState({}, '', '/leagues');
  };

  const visibleSeries = seriesRows;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{isEdit ? 'Administrar liga' : 'Crear liga'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{error}</div>}

          <section className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800">Datos de la liga</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="lg-name">Nombre *</label>
                <input id="lg-name" className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Liga Rural Casablanca" />
              </div>
              <div>
                <label className={label} htmlFor="lg-season">Temporada</label>
                <input id="lg-season" className={input} value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="lg-location">Ubicación</label>
                <input id="lg-location" className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Casablanca, Valparaíso" />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="lg-logo">URL del logo</label>
                <input id="lg-logo" className={input} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={label} htmlFor="lg-fb">Facebook</label>
                <input id="lg-fb" className={input} value={form.facebook_page_url} onChange={(e) => setForm({ ...form, facebook_page_url: e.target.value })} placeholder="https://facebook.com/..." />
              </div>
              <div>
                <label className={label} htmlFor="lg-web">Sitio web</label>
                <input id="lg-web" className={input} value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={label} htmlFor="lg-status">Estado</label>
                <select id="lg-status" className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeagueStatus })}>
                  <option value="active">Activa</option>
                  <option value="draft">Borrador</option>
                  <option value="finished">Finalizada</option>
                </select>
              </div>
              <div>
                <span className={label}>Puntos por partido (G / E / P)</span>
                <div className="flex gap-2">
                  {(['points_win', 'points_draw', 'points_loss'] as const).map((k) => (
                    <input key={k} aria-label={k} type="number" className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800">Series</h3>
                <p className="text-xs text-gray-600">Marca los campeonatos que forman parte de la liga. Busca entre los que administras y no están en otra liga (se muestran hasta 20).</p>
              </div>
              <input className={`${input} sm:max-w-[220px]`} placeholder="Buscar campeonatos" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar campeonatos" />
            </div>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {visibleSeries.length === 0 && <p className="p-4 text-sm text-gray-500">No hay campeonatos disponibles.</p>}
              {visibleSeries.map((r) => (
                <div key={r.championship.id} className="p-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 flex-1 min-w-[220px] text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={r.included}
                      onChange={(e) => updateSeries(r.championship.id, { included: e.target.checked })}
                    />
                    <span className="font-semibold text-gray-900">{r.championship.name}</span>
                  </label>
                  {r.included && (
                    <>
                      <input
                        className={`${input} max-w-[180px]`}
                        placeholder="Nombre de la serie"
                        aria-label={`Nombre de serie para ${r.championship.name}`}
                        value={r.series_name}
                        onChange={(e) => updateSeries(r.championship.id, { series_name: e.target.value })}
                      />
                      <input
                        type="number"
                        className={`${input} max-w-[80px]`}
                        aria-label={`Orden de ${r.championship.name}`}
                        title="Orden"
                        value={r.display_order}
                        onChange={(e) => updateSeries(r.championship.id, { display_order: Number(e.target.value) })}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800">Ruedas / fases</h3>
                <p className="text-xs text-gray-600">Rango de fechas (round) de cada rueda. La marcada se muestra por defecto en la tabla general.</p>
              </div>
              <button
                type="button"
                onClick={() => setPhases([...phases, { tmp: uid(), name: `${phases.length + 1}ª Rueda`, round_from: 1, round_to: 1, is_default: phases.length === 0 }])}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" /> Rueda
              </button>
            </div>
            {phases.length === 0 && <p className="text-sm text-gray-500">Sin ruedas: la tabla general se muestra acumulada.</p>}
            {phases.map((p, i) => (
              <div key={p.tmp} className="flex flex-wrap items-center gap-2">
                <input className={`${input} flex-1 min-w-[140px]`} aria-label="Nombre de la rueda" value={p.name} onChange={(e) => setPhases(phases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <span className="text-xs text-gray-600">fechas</span>
                <input type="number" className={`${input} w-20`} aria-label="Desde la fecha" value={p.round_from} onChange={(e) => setPhases(phases.map((x, j) => (j === i ? { ...x, round_from: Number(e.target.value) } : x)))} />
                <span className="text-xs text-gray-600">a</span>
                <input type="number" className={`${input} w-20`} aria-label="Hasta la fecha" value={p.round_to} onChange={(e) => setPhases(phases.map((x, j) => (j === i ? { ...x, round_to: Number(e.target.value) } : x)))} />
                <label className="flex items-center gap-1 text-xs text-gray-700">
                  <input type="radio" name="default-phase" className="accent-emerald-600" checked={p.is_default} onChange={() => setPhases(phases.map((x, j) => ({ ...x, is_default: j === i })))} />
                  Por defecto
                </label>
                <button
                  type="button"
                  aria-label="Quitar rueda"
                  onClick={() => {
                    if (p.id) setRemovedPhases([...removedPhases, p.id]);
                    setPhases(phases.filter((_, j) => j !== i));
                    setAdjs(adjs.map((a) => (a.phase_ref === p.tmp ? { ...a, phase_ref: '' } : a)));
                  }}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800">Ajustes a la tabla general</h3>
                <p className="text-xs text-gray-600">Castigos o correcciones aprobados por la liga (puntos y/o diferencia de gol).</p>
              </div>
              <button
                type="button"
                disabled={clubs.length === 0}
                onClick={() => setAdjs([...adjs, { tmp: uid(), base_team_id: '', points: 0, goal_difference: 0, reason: '', phase_ref: '' }])}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Ajuste
              </button>
            </div>
            {adjs.map((a, i) => (
              <div key={a.tmp} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_70px_70px_auto] gap-2 items-center border border-gray-100 rounded-lg p-2">
                <select className={input} aria-label="Club" value={a.base_team_id} onChange={(e) => setAdjs(adjs.map((x, j) => (j === i ? { ...x, base_team_id: e.target.value } : x)))}>
                  <option value="">Club…</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select className={input} aria-label="Rueda del ajuste" value={a.phase_ref} onChange={(e) => setAdjs(adjs.map((x, j) => (j === i ? { ...x, phase_ref: e.target.value } : x)))}>
                  <option value="">Todas las ruedas</option>
                  {phases.map((p) => (
                    <option key={p.tmp} value={p.tmp}>{p.name}</option>
                  ))}
                </select>
                <input type="number" className={input} aria-label="Puntos" title="Puntos" value={a.points} onChange={(e) => setAdjs(adjs.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} />
                <input type="number" className={input} aria-label="Diferencia de gol" title="DG" value={a.goal_difference} onChange={(e) => setAdjs(adjs.map((x, j) => (j === i ? { ...x, goal_difference: Number(e.target.value) } : x)))} />
                <button
                  type="button"
                  aria-label="Quitar ajuste"
                  onClick={() => {
                    if (a.id) setRemovedAdjs([...removedAdjs, a.id]);
                    setAdjs(adjs.filter((_, j) => j !== i));
                  }}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 justify-self-end"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <input className={`${input} col-span-2 sm:col-span-5`} placeholder="Motivo (ej. resolución reunión de delegados 01/10)" aria-label="Motivo" value={a.reason} onChange={(e) => setAdjs(adjs.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
              </div>
            ))}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          {isEdit ? (
            <button type="button" onClick={remove} disabled={saving} className="text-sm font-bold text-red-600 hover:underline disabled:opacity-50">
              Eliminar liga
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
              Cancelar
            </button>
            <button type="button" onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
