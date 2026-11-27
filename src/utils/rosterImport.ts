// Lectura de nóminas de jugadores desde Excel/CSV (formato típico de asociaciones ANFA:
// logo y datos del club arriba, y una tabla con N°, A. Paterno, A. Materno, Nombre, RUT, F. de nac.).
// Todo se lee en el navegador: el archivo no se sube.

export interface RosterRow {
  /** Fila en la planilla (para mostrar y corregir) */
  i: number;
  name: string;
  rut: string;
  rutValid: boolean;
  /** YYYY-MM-DD o null */
  birth: string | null;
}

export interface ParsedRoster {
  club: string | null;
  serie: string | null;
  rows: RosterRow[];
  /** Columnas que no se encontraron (para avisar) */
  missing: string[];
}

export const MAX_ROWS = 80;

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9°º ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const cleanRut = (v: string) => v.toUpperCase().replace(/[^0-9K]/g, '');

/** RUT chileno válido (módulo 11). */
export const rutIsValid = (v: string) => {
  const r = cleanRut(v);
  if (r.length < 2 || r.length > 9) return false;
  const body = r.slice(0, -1);
  if (!/^\d+$/.test(body)) return false;
  let s = 0;
  let m = 2;
  for (let k = body.length - 1; k >= 0; k--) {
    s += Number(body[k]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const d = 11 - (s % 11);
  return (d === 11 ? '0' : d === 10 ? 'K' : String(d)) === r.slice(-1);
};

/** 12345678K → 12.345.678-K */
export const formatRut = (v: string) => {
  const r = cleanRut(v);
  if (r.length < 2) return v.trim();
  return `${r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${r.slice(-1)}`;
};

/** 12345678K → 12.345.***-* (para mostrar sin exponer el RUT completo) */
export const maskRut = (v: string) => {
  const r = cleanRut(v);
  if (r.length < 5) return '—';
  return `${r.slice(0, -4).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}.***-*`;
};

const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'van', 'von']);
/** "JOSÉ ABDÓN DE LA FUENTE" → "José Abdón de la Fuente" */
export const titleName = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

const pad = (n: number) => String(n).padStart(2, '0');
/** Date de Excel, "10-01-1970", "10/01/70" o "1970-01-10" → "1970-01-10" (null si no se entiende). */
export const parseBirth = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return valid(y, +m[2], +m[1]);
  }
  return null;
};
const valid = (y: number, mo: number, d: number) => {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || y < 1920 || dt > new Date()) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
};

/** Lee la primera hoja con una columna "RUT" (o "Nombre"). */
export const parseRosterFile = async (file: File): Promise<ParsedRoster> => {
  const { read, utils } = await import('xlsx');
  const wb = read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const grid = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    const h = grid.findIndex((r) => r.some((c) => /^rut\b/.test(norm(c))) && r.some((c) => /nombre/.test(norm(c))));
    const headerRow = h >= 0 ? h : grid.findIndex((r) => r.some((c) => /^nombres?\b|jugador/.test(norm(c))));
    if (headerRow < 0) continue;
    const head = grid[headerRow].map(norm);
    const col = (re: RegExp) => head.findIndex((c) => re.test(c));
    const cPat = col(/paterno/);
    const cMat = col(/materno/);
    const cNom = head.findIndex((c, k) => /^nombres?\b|jugador|nombre completo/.test(c) && k !== cPat && k !== cMat);
    const cRut = col(/^rut\b|^run\b/);
    const cNac = col(/nac|nacimiento/);

    // Club y serie en las filas de arriba ("CLUB | Club Deportivo X")
    const findLabel = (re: RegExp) => {
      for (let r = 0; r < headerRow; r++) {
        const k = grid[r].findIndex((c) => re.test(norm(c)));
        if (k >= 0) {
          const v = grid[r].slice(k + 1).find((c) => String(c).trim());
          if (v) return String(v).trim();
        }
      }
      return null;
    };

    const rows: RosterRow[] = [];
    let empty = 0;
    for (let r = headerRow + 1; r < grid.length && rows.length < MAX_ROWS; r++) {
      const line = grid[r];
      const part = (k: number) => (k >= 0 ? String(line[k] ?? '').trim() : '');
      const fullName = [part(cNom), part(cPat), part(cMat)].filter(Boolean).join(' ');
      const rut = part(cRut);
      if (!fullName && !rut) {
        if (++empty >= 5) break;
        continue;
      }
      empty = 0;
      if (!fullName) continue;
      rows.push({
        i: r + 1,
        name: titleName(fullName),
        rut: rut ? formatRut(rut) : '',
        rutValid: !!rut && rutIsValid(rut),
        birth: cNac >= 0 ? parseBirth(line[cNac]) : null,
      });
    }
    const missing = [cNom < 0 ? 'Nombre' : null, cRut < 0 ? 'RUT' : null, cNac < 0 ? 'Fecha de nacimiento' : null].filter((x): x is string => !!x);
    return { club: findLabel(/^club$/), serie: findLabel(/^serie$/), rows, missing };
  }
  throw new Error('No encontramos la tabla de jugadores. La planilla debe tener una columna "Nombre" y, idealmente, "RUT".');
};
