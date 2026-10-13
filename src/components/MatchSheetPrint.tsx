import QRCode from 'react-qr-code';
import { MatchSheetContext, PRINTED_ROWS, SheetTeam, sheetUrl } from '../utils/matchSheet';

const INK = '#0c1a2e';
const box = (w: number, h: number, round = 0) => ({
  width: w,
  height: h,
  border: `1.5px solid ${INK}`,
  borderRadius: round,
  boxSizing: 'border-box' as const,
  display: 'inline-block',
});

const COLS = '30px minmax(0, 1fr) 92px 60px 24px 24px';

const TeamTable = ({ team, side }: { team: SheetTeam; side: string }) => {
  const rows = Array.from({ length: PRINTED_ROWS }, (_, i) => team.roster.find((r) => r.row === i + 1)?.name ?? '');
  return (
    <section style={{ border: `1.5px solid ${INK}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: INK, color: '#fff', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        <span className="font-display" style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {team.name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700 }}>{side}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1.5px solid ${INK}` }}>
        <span style={{ padding: '4px 0', textAlign: 'center' }}>N°</span>
        <span style={{ padding: '4px 4px' }}>Jugador</span>
        <span style={{ padding: '4px 0', textAlign: 'center' }}>Firma</span>
        <span style={{ padding: '4px 0', textAlign: 'center' }}>Goles</span>
        <span style={{ padding: '4px 0', textAlign: 'center' }}>TA</span>
        <span style={{ padding: '4px 0', textAlign: 'center' }}>TR</span>
      </div>
      {rows.map((name, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 20, borderBottom: '1px solid #9aa6a0' }}>
          <span style={{ ...box(24, 15, 3), justifySelf: 'center' }} />
          <span className="font-display" style={{ fontSize: 13, fontWeight: 600, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
          <span style={{ alignSelf: 'end', height: 14, margin: '0 6px 3px', borderBottom: `1px solid ${INK}` }} />
          <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {[0, 1, 2, 3].map((g) => (
              <span key={g} style={box(11, 11, 999)} />
            ))}
          </span>
          <span style={{ ...box(12, 12), justifySelf: 'center' }} />
          <span style={{ ...box(12, 12), justifySelf: 'center' }} />
        </div>
      ))}
      <div style={{ padding: '4px 10px', fontSize: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          Autogoles del rival a favor: <span style={{ ...box(24, 14), verticalAlign: 'middle' }} />
        </span>
        <span>Total jugadores: ____</span>
      </div>
    </section>
  );
};

/** Una papeleta A4 lista para imprimir (ver diseño "Papeleta de partido MedioGol"). */
export const MatchSheetPrint = ({ ctx }: { ctx: MatchSheetContext }) => {
  const date = new Date(ctx.match_date);
  const when = `${date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
  const competition = [ctx.league, ctx.series || ctx.championship].filter(Boolean).join(' · ');
  const corner = { position: 'absolute' as const, width: 14, height: 14, background: INK, printColorAdjust: 'exact' as const, WebkitPrintColorAdjust: 'exact' as const };

  return (
    <article
      className="match-sheet"
      aria-label={`Papeleta ${ctx.code}`}
      style={{ position: 'relative', width: '210mm', height: '297mm', boxSizing: 'border-box', padding: '30px 40px', background: '#fff', color: INK, fontFamily: 'Manrope, system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}
    >
      <span aria-hidden="true" style={{ ...corner, left: 16, top: 16 }} />
      <span aria-hidden="true" style={{ ...corner, right: 16, top: 16 }} />
      <span aria-hidden="true" style={{ ...corner, left: 16, bottom: 16 }} />
      <span aria-hidden="true" style={{ ...corner, right: 16, bottom: 16 }} />

      <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>MedioGol · Papeleta de partido</div>
          <h1 className="font-display" style={{ margin: 0, fontSize: 28, lineHeight: '29px', fontWeight: 800, textTransform: 'uppercase' }}>
            {competition}
          </h1>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {[ctx.round ? `Fecha ${ctx.round}` : null, when, ctx.venue].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11 }}>
            <span>Árbitro: ______________________________</span>
            <span>Hora de inicio real: ____ : ____</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none' }}>
          <QRCode value={sheetUrl(ctx.match_id)} size={84} level="M" fgColor={INK} />
          <span className="font-display" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>{ctx.code}</span>
        </div>
      </header>

      <section aria-label="Resultado" style={{ border: `2px solid ${INK}`, borderRadius: 10, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Local</span>
          <span className="font-display" style={{ fontSize: 22, lineHeight: '23px', fontWeight: 800, textTransform: 'uppercase' }}>{ctx.home.name}</span>
          <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={box(13, 13)} />
            No se presentó (W.O.)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', gap: 4 }}>
            <span style={box(36, 46, 6)} />
            <span style={box(36, 46, 6)} />
          </span>
          <span className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>–</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <span style={box(36, 46, 6)} />
            <span style={box(36, 46, 6)} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Visita</span>
          <span className="font-display" style={{ fontSize: 22, lineHeight: '23px', fontWeight: 800, textTransform: 'uppercase' }}>{ctx.away.name}</span>
          <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            No se presentó (W.O.)
            <span style={box(13, 13)} />
          </span>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <TeamTable team={ctx.home} side="Local" />
        <TeamTable team={ctx.away} side="Visita" />
      </div>

      <section aria-label="Observaciones" style={{ border: `1.5px solid ${INK}`, borderRadius: 8, padding: '6px 12px', height: 70, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Observaciones del árbitro (expulsiones, incidentes, partido suspendido)
        </div>
      </section>

      <section aria-label="Firmas" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 18, paddingTop: 22 }}>
        {['Firma encargado de turno', 'Firma árbitro', 'Firma capitán local', 'Firma capitán visita'].map((label) => (
          <div key={label} style={{ borderTop: `1.5px solid ${INK}`, paddingTop: 3, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
            {label}
          </div>
        ))}
      </section>

      <footer style={{ marginTop: 'auto', borderTop: '1px solid #9aa6a0', paddingTop: 6, display: 'flex', gap: 16, fontSize: 10, lineHeight: '14px' }}>
        <div style={{ flex: 1 }}>
          <strong>Cómo llenarla:</strong> cada jugador que juega escribe su N° de camiseta y firma · rellena un círculo por cada gol · marca TA/TR con X · si juega alguien que no aparece, escríbelo con letra de imprenta en una fila en blanco.
        </div>
        <div style={{ flex: 1 }}>
          <strong>Al terminar:</strong> escanea el QR o entra a MedioGol y sube una foto de la hoja completa, de frente y con buena luz, con las 4 esquinas ■ a la vista. Esta papeleta no pide RUT.
        </div>
      </footer>
    </article>
  );
};
