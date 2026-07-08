import { useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { exportData, importData } from '../lib/storage';
import Waterline from './Waterline';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/roster', label: 'Roster' },
  { to: '/checklist', label: 'Build Checklist' },
  { to: '/log', label: 'Weekly Log' },
  { to: '/charts', label: 'Parameters' },
];

const NEW_TANK_VALUE = '__new__';

export default function Layout() {
  const { activeTank, data, setData, setActiveTankId } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importData(file);
      setData(imported);
      alert('Backup restored.');
    } catch (err) {
      alert('Could not read that file — is it a tank tracker backup?');
    }
    e.target.value = '';
  }

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
              <option key={t.id} value={t.id} className="bg-deepwater text-base font-body">
                {t.name}
              </option>
            ))}
            <option value={NEW_TANK_VALUE} className="bg-deepwater text-base font-body">
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
            <button
              onClick={() => exportData(data)}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors"
              title="Download a JSON backup of all your data"
            >
              Export
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors"
              title="Restore from a JSON backup"
            >
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImport}
            />
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
