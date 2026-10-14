// Montos en pesos chilenos enteros (sin decimales).

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export const formatCLP = (n: number | null | undefined) => clp.format(Number(n) || 0);

/** "$ 15.000" o "15000" → 15000. Devuelve null si no es un entero válido. */
export const parseCLP = (text: string): number | null => {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
};

/** Fecha 'YYYY-MM-DD' sin correr el día por zona horaria. */
export const formatDay = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Hoy en Chile como 'YYYY-MM-DD'. */
export const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

/** Descarga un CSV que Excel abre bien (BOM + punto y coma). */
export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
