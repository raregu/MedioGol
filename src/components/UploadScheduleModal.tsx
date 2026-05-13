import { useState, useRef } from 'react';
import { X, Upload, Download, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Team {
  id: string;
  name: string;
}

interface ParsedMatch {
  jornada: number;
  fecha: string;       // ISO date string
  hora: string;        // HH:MM
  local: string;       // nombre tal como viene del Excel
  visita: string;
  cancha: string;
  home_team_id: string | null;
  away_team_id: string | null;
  error: string | null;
}

interface Props {
  championshipId: string;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
}

// Normalizar nombre para comparación fuzzy
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Parsear fecha desde Excel (puede ser número serial, string dd/mm/yyyy, yyyy-mm-dd, etc.)
const parseExcelDate = (val: any): string | null => {
  if (!val) return null;
  // Número serial Excel
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  // dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd-mm-yyyy
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2,'0')}-${dmy2[1].padStart(2,'0')}`;
  return null;
};

// Parsear hora (puede ser número decimal de Excel, string HH:MM, etc.)
const parseExcelTime = (val: any): string => {
  if (!val) return '12:00';
  if (typeof val === 'number') {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2,'0')}:${match[2]}`;
  return '12:00';
};

export default function UploadScheduleModal({ championshipId, teams, onClose, onSuccess }: Props) {
  const [matches, setMatches] = useState<ParsedMatch[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);

  const matchTeam = (name: string): string | null => {
    const n = normalize(name);
    // Coincidencia exacta primero
    let found = teams.find(t => normalize(t.name) === n);
    if (found) return found.id;
    // Coincidencia parcial
    found = teams.find(t => normalize(t.name).includes(n) || n.includes(normalize(t.name)));
    return found?.id ?? null;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const { read, utils } = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = utils.sheet_to_json(ws, { defval: '' });

    // Detectar columnas flexible (acepta variantes en español/inglés)
    const colMap = (row: any, keys: string[]): string => {
      for (const k of Object.keys(row)) {
        if (keys.some(key => normalize(k).includes(normalize(key)))) return row[k];
      }
      return '';
    };

    const parsed: ParsedMatch[] = rows
      .filter(r => Object.values(r).some(v => v !== ''))
      .map((r, i) => {
        const local = String(colMap(r, ['local', 'home', 'equipo local', 'equipolocal']) || '').trim();
        const visita = String(colMap(r, ['visita', 'away', 'equipo visita', 'equipovisita', 'visitante']) || '').trim();
        const fechaRaw = colMap(r, ['fecha', 'date', 'dia']);
        const horaRaw = colMap(r, ['hora', 'hour', 'time', 'horario']);
        const jornada = parseInt(String(colMap(r, ['jornada', 'fecha', 'round', 'ronda', 'jor']))) || (i + 1);
        const cancha = String(colMap(r, ['cancha', 'venue', 'recinto', 'estadio', 'campo']) || '').trim();

        const fecha = parseExcelDate(fechaRaw);
        const hora = parseExcelTime(horaRaw);
        const home_team_id = local ? matchTeam(local) : null;
        const away_team_id = visita ? matchTeam(visita) : null;

        let error: string | null = null;
        if (!local || !visita) error = 'Faltan equipos';
        else if (!fecha) error = 'Fecha inválida';
        else if (!home_team_id) error = `Equipo "${local}" no encontrado`;
        else if (!away_team_id) error = `Equipo "${visita}" no encontrado`;
        else if (home_team_id === away_team_id) error = 'Local y visita son el mismo equipo';

        return { jornada, fecha: fecha || '', hora, local, visita, cancha, home_team_id, away_team_id, error };
      });

    setMatches(parsed);
    setStep('preview');
  };

  const validMatches = matches.filter(m => !m.error);
  const invalidMatches = matches.filter(m => m.error);

  const handleImport = async () => {
    if (!validMatches.length) return;
    setImporting(true);
    try {
      const rows = validMatches.map(m => ({
        championship_id: championshipId,
        home_team_id: m.home_team_id!,
        away_team_id: m.away_team_id!,
        match_date: `${m.fecha}T${m.hora}:00`,
        round: m.jornada,
        venue: m.cancha || null,
        status: 'scheduled',
      }));

      const { error } = await supabase.from('matches').insert(rows);
      if (error) throw error;
      setImported(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err: any) {
      alert('Error al importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const { utils, writeFile } = await import('xlsx');
    const data = [
      ['Jornada', 'Fecha', 'Hora', 'Local', 'Visita', 'Cancha'],
      [1, '01/06/2026', '15:00', teams[0]?.name || 'Equipo A', teams[1]?.name || 'Equipo B', 'Cancha 1'],
      [1, '01/06/2026', '17:00', teams[2]?.name || 'Equipo C', teams[3]?.name || 'Equipo D', 'Cancha 2'],
    ];
    const ws = utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Programacion');
    writeFile(wb, 'plantilla_programacion.xlsx');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Cargar Programación desde Excel</h2>
              <p className="text-sm text-gray-500">{step === 'upload' ? 'Sube el archivo con los partidos' : `${matches.length} filas encontradas`}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {step === 'upload' && (
            <div className="space-y-6">
              {/* Plantilla */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-4">
                <div>
                  <p className="font-bold text-blue-900 mb-1">Formato requerido del Excel</p>
                  <p className="text-sm text-blue-700">Columnas: <strong>Jornada · Fecha · Hora · Local · Visita · Cancha</strong></p>
                  <p className="text-sm text-blue-600 mt-1">Los nombres de equipos deben coincidir con los registrados en el campeonato.</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm"
                >
                  <Download className="h-4 w-4" />
                  Plantilla
                </button>
              </div>

              {/* Equipos disponibles */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-bold text-gray-700 mb-2">Equipos en este campeonato ({teams.length})</p>
                <div className="flex flex-wrap gap-2">
                  {teams.map(t => (
                    <span key={t.id} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm text-gray-700">{t.name}</span>
                  ))}
                </div>
              </div>

              {/* Upload area */}
              <label
                htmlFor="excel-upload"
                className="flex flex-col items-center gap-4 p-12 border-4 border-dashed border-emerald-300 rounded-2xl cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all"
              >
                <Upload className="h-16 w-16 text-emerald-400" />
                <div className="text-center">
                  <p className="text-xl font-black text-gray-700">Arrastra tu Excel aquí</p>
                  <p className="text-gray-400 mt-1">o haz clic para seleccionar (.xlsx, .xls, .csv)</p>
                </div>
              </label>
              <input id="excel-upload" ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-gray-900">{matches.length}</p>
                  <p className="text-sm text-gray-500">Total filas</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-green-600">{validMatches.length}</p>
                  <p className="text-sm text-green-600">Listos para importar</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-red-600">{invalidMatches.length}</p>
                  <p className="text-sm text-red-500">Con errores</p>
                </div>
              </div>

              {/* Tabla preview */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Estado</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Jornada</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Fecha</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Hora</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Local</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Visita</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500">Cancha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {matches.map((m, i) => (
                      <tr key={i} className={m.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2">
                          {m.error
                            ? <span title={m.error}><XCircle className="h-4 w-4 text-red-500" /></span>
                            : <CheckCircle2 className="h-4 w-4 text-green-500" />
                          }
                        </td>
                        <td className="px-3 py-2 font-medium">{m.jornada}</td>
                        <td className="px-3 py-2">{m.fecha || <span className="text-red-500">—</span>}</td>
                        <td className="px-3 py-2">{m.hora}</td>
                        <td className={`px-3 py-2 font-medium ${!m.home_team_id ? 'text-red-600' : 'text-gray-900'}`}>{m.local}</td>
                        <td className={`px-3 py-2 font-medium ${!m.away_team_id ? 'text-red-600' : 'text-gray-900'}`}>{m.visita}</td>
                        <td className="px-3 py-2 text-gray-500">{m.cancha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidMatches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-bold text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Errores encontrados
                  </p>
                  {invalidMatches.map((m, i) => (
                    <p key={i} className="text-sm text-red-700">• Fila {matches.indexOf(m) + 2}: {m.error}</p>
                  ))}
                  <p className="text-sm text-red-600 mt-2">Las filas con error no se importarán. Corrígelas en el Excel y vuelve a subir.</p>
                </div>
              )}

              {imported && (
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <p className="font-bold text-green-800">¡{validMatches.length} partidos importados correctamente!</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex gap-3 justify-between">
          {step === 'preview' && (
            <button
              onClick={() => { setStep('upload'); setMatches([]); }}
              className="px-5 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-bold"
            >
              ← Subir otro archivo
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-5 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-bold">
              Cancelar
            </button>
            {step === 'preview' && validMatches.length > 0 && !imported && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {importing ? <Loader className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {importing ? 'Importando...' : `Importar ${validMatches.length} partidos`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
