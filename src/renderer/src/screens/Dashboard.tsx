import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { AlertTriangle, CalendarClock, FileCheck2 } from 'lucide-react'
import { api } from '../lib/api'
import { fmtDate, fmtMoney } from '../lib/format'

export default function Dashboard(): JSX.Element {
  const nav = useNavigate()
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard.get() })

  const chartData = (data?.collectionTrend ?? []).map((m) => ({ label: m.label, value: m.amount / 100 }))

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-slate-500">Collections, dues and outstanding at a glance.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's collection" value={fmtMoney(data?.todayCollection)} />
        <Kpi label="Collected this month" value={fmtMoney(data?.monthCollection)} tone="text-green-600" />
        <Kpi label="Expenses this month" value={fmtMoney(data?.monthExpenses)} tone="text-accent-600" />
        <Kpi
          label="Net this month"
          value={fmtMoney(data?.monthNet)}
          tone={(data?.monthNet ?? 0) < 0 ? 'text-accent-600' : 'text-brand-700'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Collection (last 6 months)</h2>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v: number) => fmtMoney(Math.round(v * 100))} />
                <Bar dataKey="value" fill="#1e1b8c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="text-sm text-slate-500">Total outstanding</div>
            <div className="mt-1 text-2xl font-semibold text-accent-600">{fmtMoney(data?.totalOutstanding)}</div>
          </div>
          <button onClick={() => nav('/dues')} className="card flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50">
            <AlertTriangle className="text-accent-500" />
            <div>
              <div className="text-2xl font-semibold text-accent-600">{fmtMoney(data?.overdueAmount)}</div>
              <div className="text-sm text-slate-500">Overdue across {data?.overdueStudents ?? 0} student(s)</div>
            </div>
          </button>
          <button onClick={() => nav('/dues')} className="card flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50">
            <CalendarClock className="text-brand-600" />
            <div>
              <div className="text-2xl font-semibold text-brand-700">{data?.upcomingCount ?? 0}</div>
              <div className="text-sm text-slate-500">Installments due in the next 14 days</div>
            </div>
          </button>
          {(data?.pdcDueCount ?? 0) > 0 && (
            <button onClick={() => nav('/cheques')} className="card flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50">
              <FileCheck2 className="text-amber-500" />
              <div>
                <div className="text-2xl font-semibold text-amber-600">{fmtMoney(data?.pdcDueAmount)}</div>
                <div className="text-sm text-slate-500">{data?.pdcDueCount} cheque(s) to deposit now</div>
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="card mt-6 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent payments</h2>
        {data && data.recentPayments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {data?.recentPayments.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/students/${p.studentId}`)}>
                  <td className="py-2 font-mono text-xs text-slate-500">{p.receiptNo}</td>
                  <td className="py-2 text-slate-700">{p.studentName}</td>
                  <td className="py-2 text-slate-400">{fmtDate(p.paymentDate)}</td>
                  <td className="py-2 text-right font-medium">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone = 'text-brand-700' }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  )
}
