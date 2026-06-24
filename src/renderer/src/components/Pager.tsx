export const PAGE_SIZE = 50

/** Minimal prev/next pager. `count` is the number of rows on the current page;
 * Next is disabled when fewer than a full page came back. */
export function Pager({
  page,
  setPage,
  count
}: {
  page: number
  setPage: (p: number) => void
  count: number
}): JSX.Element | null {
  if (page === 0 && count < PAGE_SIZE) return null
  return (
    <div className="mt-3 flex items-center justify-end gap-3 text-sm">
      <span className="text-slate-400">Page {page + 1}</span>
      <button className="btn-outline py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>
        Prev
      </button>
      <button className="btn-outline py-1" disabled={count < PAGE_SIZE} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  )
}
