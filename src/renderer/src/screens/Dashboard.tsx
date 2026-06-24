const PLACEHOLDER_KPIS = [
  { label: "Today's collection", value: '—' },
  { label: 'This month', value: '—' },
  { label: 'Outstanding', value: '—' },
  { label: 'Overdue students', value: '—' }
]

export default function Dashboard(): JSX.Element {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-slate-500">
        Collection totals, upcoming dues, overdue alerts and expense summaries will appear here.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDER_KPIS.map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <div className="text-sm text-slate-500">{kpi.label}</div>
            <div className="mt-2 text-3xl font-semibold text-brand-700">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="card mt-6 p-6 text-sm text-slate-500">
        The secure foundation is ready: encrypted local database, master-password login and session
        management. Student, fee, payment, expense and reporting modules are being added next.
      </div>
    </div>
  )
}
