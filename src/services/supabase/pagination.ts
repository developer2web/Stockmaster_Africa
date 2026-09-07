type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// Callers must use a stable ordering ending with a unique column.
// Continue until an empty page, even if the server caps pages below our size.
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
