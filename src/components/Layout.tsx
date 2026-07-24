import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { exportData, serializeBackup } from '../lib/storage';
import { uploadBackup } from '../lib/googleDrive';
import Waterline from './Waterline';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/roster', label: 'Roster' },
  { to: '/targets', label: 'Compatibility' },
  { to: '/checklist', label: 'Build Checklist' },
  { to: '/log', label: 'Weekly Log' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/charts', label: 'Parameters' },
];

const NEW_TANK_VALUE = '__new__';

export default function Layout() {
  const { activeTank, data, setActiveTankId } = useData();
  const navigate = useNavigate();
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  async function handleUploadToDrive() {
    setDriveStatus('uploading');
    try {
      await uploadBackup(serializeBackup(data));
      setDriveStatus('done');
    } catch (err) {
      console.error(err);
      setDriveStatus('error');
    } finally {
      setTimeout(() => setDriveStatus('idle'), 2500);
    }
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
        <nav className="flex flex-nowrap md:flex-wrap gap-1 items-center overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
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
              `px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${
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
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-moss/30 shrink-0">
            <NavLink
              to="/docs"
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                  isActive
                    ? 'bg-moss text-foam'
                    : 'text-foam-dim hover:text-amber hover:bg-deepwater-2'
                }`
              }
              title="AI Quickstart & Import Guide — full site context and import format reference for an AI assistant"
            >
              Docs
            </NavLink>
            <button
              onClick={() => exportData(data, activeTank.name)}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap"
              title="Download a JSON backup of all your data"
            >
              Export
            </button>
            <button
              onClick={handleUploadToDrive}
              disabled={driveStatus === 'uploading'}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap disabled:opacity-60"
              title="Back up all your data to Google Drive — only happens when you click this, never automatically"
            >
              {driveStatus === 'uploading'
                ? 'Uploading…'
                : driveStatus === 'done'
                  ? '✓ Uploaded'
                  : driveStatus === 'error'
                    ? '⚠ Failed'
                    : 'Upload to Drive'}
            </button>
            <button
              onClick={() => navigate('/new-tank')}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap"
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

      <footer className="px-6 md:px-10 py-6 border-t border-moss/20 bg-gradient-to-b from-deepwater-2 to-[#0a1f1c] flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-foam-dim/60">
          Built and logged by hand. Data lives in your browser — export often.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="https://github.com/ETTRAN777/aquariumTool"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="text-foam-dim/60 hover:text-amber transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 19 19" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
              />
            </svg>
          </a>
          <a
            href="https://ettran777.github.io/portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View portfolio"
            title="View portfolio"
            className="text-foam-dim/60 hover:text-amber transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="6.5" r="3.5" />
              <path d="M3.5 17c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
