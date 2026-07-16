import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { exportData } from '../lib/storage';
import Waterline from './Waterline';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/roster', label: 'Roster' },
  { to: '/targets', label: 'Targets' },
  { to: '/checklist', label: 'Build Checklist' },
  { to: '/log', label: 'Weekly Log' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/charts', label: 'Parameters' },
];

const NEW_TANK_VALUE = '__new__';

export default function Layout() {
  const { activeTank, data, setActiveTankId } = useData();
  const navigate = useNavigate();

  function handleTankSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === NEW_TANK_VALUE) {
      navigate('/new-tank');
      return;
    }
    setActiveTankId(e.target.value);
    navigate('/');
  }

  if (!activeTank) return null;

  return (
    <div className="min-h-screen flex flex-col bg-deepwater text-foam font-body">
      <header className="border-b border-moss/30 px-6 md:px-10 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs tracking-widest text-sand uppercase">
              {activeTank.sizeGallons} gal{activeTank.style ? ` · ${activeTank.style}` : ''}
            </p>
          </div>
          <select
            value={activeTank.id}
            onChange={handleTankSwitch}
            aria-label="Switch tank"
            className="font-display text-3xl md:text-4xl font-semibold text-foam bg-transparent border-none outline-none cursor-pointer -ml-1 max-w-full"
          >
            {data.tanks.map((t) => (
              <option
                key={t.id}
                value={t.id}
                style={{
                  backgroundColor: 'var(--color-deepwater)',
                  color: 'var(--color-foam)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  fontWeight: 400,
                }}
              >
                {t.name}
              </option>
            ))}
            <option
              value={NEW_TANK_VALUE}
              style={{
                backgroundColor: 'var(--color-deepwater)',
                color: 'var(--color-foam)',
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                fontWeight: 400,
              }}
            >
              + New tank…
            </option>
          </select>
        </div>
        <nav className="flex flex-wrap gap-1 items-center">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-moss text-foam'
                    : 'text-foam-dim hover:text-foam hover:bg-deepwater-2'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-moss text-foam'
                  : 'text-foam-dim hover:text-foam hover:bg-deepwater-2'
              }`
            }
            aria-label="Tank settings"
            title="Tank settings"
          >
            ⚙
          </NavLink>
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-moss/30">
            <NavLink
              to="/docs"
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-moss text-foam'
                    : 'text-foam-dim hover:text-amber hover:bg-deepwater-2'
                }`
              }
              title="JSON format reference — for generating an importable tank plan with an AI assistant"
            >
              Docs
            </NavLink>
            <button
              onClick={() => exportData(data, activeTank.name)}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors"
              title="Download a JSON backup of all your data"
            >
              Export
            </button>
            <button
              onClick={() => navigate('/new-tank')}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors"
              title="Bring in a tank from a backup file"
            >
              Import
            </button>
          </div>
        </nav>
      </header>

      <Waterline />

      <main className="flex-1 px-6 md:px-10 py-8 bg-deepwater-2">
        <Outlet />
      </main>

      <footer className="px-6 md:px-10 py-6 border-t border-moss/20 bg-gradient-to-b from-deepwater-2 to-[#0a1f1c]">
        <p className="font-mono text-xs text-foam-dim/60">
          Built and logged by hand. Data lives in your browser — export often.
        </p>
      </footer>
    </div>
  );
}
