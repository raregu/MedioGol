/**
 * Supabase/PostgREST devuelve como máximo 1000 filas por consulta.
 * Esta función pide páginas sucesivas hasta traer todas las filas.
 * `build(from, to)` debe devolver la consulta con `.range(from, to)` aplicado.
 */
export const fetchAllRows = async <T,>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> => {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
};
