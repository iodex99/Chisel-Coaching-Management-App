export const PAGE_SIZE = 50
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/** Prev/next pager with an optional "rows per page" selector. `count` is the
 * number of rows on the current page; Next is disabled when fewer than a full
 * page came back. Pass `setPageSize` to show the rows-per-page dropdown. */
export function Pager({
  page,
  setPage,
  count,
  pageSize = PAGE_SIZE,
  setPageSize
}: {
  page: number
  setPage: (p: number) => void
  count: number
  pageSize?: number
  setPageSize?: (n: number) => void
}): JSX.Element | null {
  // With no size control and a single short page there's nothing to show.
  if (!setPageSize && page === 0 && count < pageSize) return null
  return (
    <div className="mt-3 flex items-center justify-end gap-3 text-sm">
      {setPageSize && (
        <label className="flex items-center gap-2 text-slate-400">
          Rows per page
          <select className="input w-20 py-1" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="text-slate-400">Page {page + 1}</span>
      <button className="btn-outline py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>
        Prev
      </button>
      <button className="btn-outline py-1" disabled={count < pageSize} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  )
}
