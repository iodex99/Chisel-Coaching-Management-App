import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Wallet,
  Receipt,
  CalendarClock,
  TrendingDown,
  BarChart3,
  Landmark,
  Settings as SettingsIcon,
  LogOut,
  type LucideIcon
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { useAuth } from '../store/auth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  enabled: boolean
  end?: boolean
}

/** Navigation. `enabled: false` items render as "Soon" until their phase lands. */
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, enabled: true, end: true },
  { to: '/students', label: 'Students', icon: Users, enabled: true },
  { to: '/batches', label: 'Batches', icon: GraduationCap, enabled: true },
  { to: '/fees', label: 'Fees', icon: Wallet, enabled: true },
  { to: '/payments', label: 'Payments', icon: Receipt, enabled: true },
  { to: '/dues', label: 'Due Monitoring', icon: CalendarClock, enabled: false },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown, enabled: false },
  { to: '/accounts', label: 'Accounts', icon: Landmark, enabled: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, enabled: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, enabled: true }
]

export default function AppShell(): JSX.Element {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col bg-brand-800 text-white">
        <div className="p-4">
          <Logo className="w-full rounded-md bg-white p-2" />
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    isActive ? 'bg-white/15 font-medium text-white' : 'text-white/80 hover:bg-white/10'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ) : (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40"
                title="Coming soon"
              >
                <span className="flex items-center gap-3">
                  <item.icon size={18} />
                  {item.label}
                </span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
              </div>
            )
          )}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 px-1 text-xs text-white/60">
            Signed in as <span className="font-medium text-white">{user?.displayName}</span>
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  )
}
