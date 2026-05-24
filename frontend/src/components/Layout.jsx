import { Outlet, NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',          label: 'Notebooks', icon: '📓', exact: true },
  { to: '/practice',  label: 'Practice',  icon: '✏️' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/mistakes',  label: 'Mistakes',  icon: '🔍' },
  { to: '/settings',  label: 'Settings',  icon: '⚙️' },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-cerebro-surface border-r border-cerebro-border flex flex-col">
        <div className="px-5 py-5 border-b border-cerebro-border flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-white">Cerebro</span>
          <span className="text-xs text-cerebro-accent font-medium">v1</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-cerebro-accent/15 text-cerebro-accent font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-cerebro-border'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-cerebro-border text-xs text-gray-600">
          Cerebro AI · Phase 1
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-cerebro-bg">
        <Outlet />
      </main>
    </div>
  )
}
