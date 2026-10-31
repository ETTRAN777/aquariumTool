import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { exportData, serializeBackup, stripPhotos, formatBytes } from '../lib/storage';
import Toast from './Toast';
import { uploadBackup } from '../lib/googleDrive';
import Waterline from './Waterline';
import DrivePickerModal from './DrivePickerModal';
import ConfirmModal from './ConfirmModal';
import ExportPickerModal from './ExportPickerModal';
import TankSwitcher from './TankSwitcher';
import { STATUS_LABELS } from '../lib/constants';
import { ensureLocalStorageCapMeasured } from '../lib/storageUsage';
import type { Tank, AppData } from '../types';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/roster', label: 'Roster' },
  { to: '/targets', label: 'Compatibility' },
  { to: '/checklist', label: 'Plan' },
  { to: '/log', label: 'Log' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/charts', label: 'Parameters' },
];

// The least width the tank name is guaranteed before the nav gives up and
// drops below it. A name shorter than this is guaranteed in full; a longer
// one is allowed to shrink down to this and truncate with an ellipsis
// ("The Shrimp Ta…") rather than push the nav onto its own row.
const MIN_TITLE_CLEARANCE_REM = 12;

export default function Layout() {
  const {
    activeTank,
    data,
    setActiveTankId,
    saveFailure,
    autoFreedStorage,
    clearAutoFreedStorage,
    rosterStatusSync,
    clearRosterStatusSync,
  } = useData();
  const navigate = useNavigate();

  // Header layout. The nav sits beside the tank title only when BOTH fit:
  // the nav at its full single-line width, and the title at its natural
  // width (floored; see MIN_TITLE_CLEARANCE_REM). Otherwise the nav drops
  // below the title as its own scrollable row — the layout phones always
  // got — at any window size, instead of squeezing the title to nothing or
  // wrapping the nav over it. Nothing here is a pixel breakpoint: both
  // sides are measured from the rendered content, so a longer tank name,
  // a wider font or a changed label moves the switch point by itself.
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [stacked, setStacked] = useState(false);
  const hasTank = Boolean(activeTank);

  function measureHeader() {
    const header = headerRef.current;
    const nav = navRef.current;
    if (!header || !nav || nav.children.length === 0) return;
    const headerStyle = getComputedStyle(header);
    const available =
      header.clientWidth - parseFloat(headerStyle.paddingLeft) - parseFloat(headerStyle.paddingRight);
    // The nav's natural single-line width: its items never shrink, so it is
    // just their widths, margins and gaps added up. Summed rather than read
    // off first-left to last-right, because the stacked layout can scroll the nav
    // sideways, which makes its own box narrower than its content.
    const navStyle = getComputedStyle(nav);
    const itemGap = parseFloat(navStyle.columnGap) || 0;
    let navWidth = itemGap * (nav.children.length - 1);
    for (const child of Array.from(nav.children)) {
      const cs = getComputedStyle(child);
      navWidth +=
        child.getBoundingClientRect().width + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
    }
    // The title's natural width: its full text (scrollWidth ignores the
    // ellipsis clipping) plus the chevron and spacing around it.
    const button = header.querySelector<HTMLElement>('[data-tank-title]');
    const text = header.querySelector<HTMLElement>('[data-tank-title-text]');
    let titleWidth = 0;
    if (button && text) {
      titleWidth = text.scrollWidth + (button.offsetWidth - text.offsetWidth);
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    titleWidth = Math.min(titleWidth, MIN_TITLE_CLEARANCE_REM * rem);
    const gap = parseFloat(headerStyle.columnGap) || 0;
    setStacked(navWidth + gap + titleWidth > available);
  }

  // Before paint, so there is never a frame of the wrong layout.
  useLayoutEffect(() => {
    measureHeader();
  });

  useEffect(() => {
    const header = headerRef.current;
    const nav = navRef.current;
    if (!header || !nav) return;
    const observer = new ResizeObserver(() => measureHeader());
    observer.observe(header);
    for (const child of Array.from(nav.children)) observer.observe(child);
    // Web fonts changing widths after first paint.
    void document.fonts?.ready.then(measureHeader);
    return () => observer.disconnect();
    // measureHeader only reads refs and the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTank]);

  // One-time, idle-time measurement of this browser's localStorage limit
  // for Settings' storage meter. A no-op once a number has been recorded —
  // see lib/storageUsage.ts.
  useEffect(() => {
    void ensureLocalStorageCapMeasured();
  }, []);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport(selectedTanks: Tank[], stripImages: boolean) {
    setIsExporting(true);
    // Single-tank export gets named for that tank, same as before — but
    // now the content genuinely matches the filename, since previously
    // "Export" always included every tank regardless of the name prefix.
    // Anything else (all tanks, or an arbitrary multi-selection) gets a
    // neutral filename rather than implying a scope that isn't accurate.
    const tanksToExport = stripImages ? stripPhotos(selectedTanks) : selectedTanks;
    const payload: AppData = {
      activeTankId: tanksToExport[0]?.id ?? '',
      tanks: tanksToExport,
    };
    const name = tanksToExport.length === 1 ? tanksToExport[0].name : undefined;
    try {
      await exportData(payload, name, stripImages);
      setExportPickerOpen(false);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleUploadToDrive() {
    setDriveStatus('uploading');
    try {
      await uploadBackup(await serializeBackup(data));
      setDriveStatus('done');
    } catch (err) {
      console.error(err);
      setDriveStatus('error');
    } finally {
      setTimeout(() => setDriveStatus('idle'), 2500);
    }
  }

  function handleTankSwitch(id: string) {
    setActiveTankId(id);
    navigate('/');
  }

  if (!activeTank) return null;

  return (
    <div className="min-h-screen flex flex-col bg-deepwater text-foam font-body">
      <header
        ref={headerRef}
        className={`border-b border-moss/30 px-6 md:px-10 py-4 flex gap-4 ${
          stacked ? 'flex-col' : 'flex-row items-center justify-between'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs tracking-widest text-sand uppercase">
              {activeTank.sizeGallons} gal{activeTank.style ? ` · ${activeTank.style}` : ''}
            </p>
          </div>
          <TankSwitcher
            tanks={data.tanks}
            activeTank={activeTank}
            onSwitch={handleTankSwitch}
            onNewTank={() => navigate('/new-tank')}
          />
        </div>
        <nav
          ref={navRef}
          className={`flex gap-1 items-center ${
            stacked
              ? 'flex-nowrap overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0'
              : 'flex-nowrap shrink-0'
          }`}
        >
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
            <button
              onClick={() => navigate('/new-tank')}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap"
              title="Bring in a tank from a backup file"
            >
              Import
            </button>
            <button
              onClick={() => setExportPickerOpen(true)}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap"
              title="Download a JSON backup — choose all tanks, just this one, or pick specific tanks"
            >
              Export
            </button>
            <button
              onClick={() => setDrivePickerOpen(true)}
              disabled={driveStatus === 'uploading'}
              className="px-3 py-2 rounded-md text-sm font-medium text-foam-dim hover:text-amber hover:bg-deepwater-2 transition-colors shrink-0 whitespace-nowrap disabled:opacity-60"
              title="Optional Google Drive sync — manual, only runs when you choose Upload or Download"
            >
              {driveStatus === 'uploading'
                ? 'Uploading…'
                : driveStatus === 'done'
                  ? '✓ Uploaded'
                  : driveStatus === 'error'
                    ? '⚠ Failed'
                    : 'Google Drive'}
            </button>
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
          </div>
        </nav>
      </header>

      <Waterline />

      {/* Persistent on purpose (not an auto-dismissing Toast): the failure
          it reports means recent edits exist only in this tab's memory, and
          a message that vanishes after five seconds is exactly how that
          used to go unnoticed. Clears itself once a save succeeds again. */}
      {saveFailure && (
        <div className="px-6 md:px-10 pt-6 bg-deepwater-2">
          <div
            role="alert"
            className="card border border-coral/40 px-4 py-3 text-sm text-coral flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p className="flex-1 leading-relaxed">
              <span className="font-semibold">⚠ Your latest changes aren't being saved.</span>{' '}
              {saveFailure === 'quota'
                ? "This browser's storage for the app is completely full — it already tried freeing up space automatically and that wasn't enough. Until more space is freed, refreshing or closing this tab will lose recent changes. Export a backup now, then consider removing an old tank or log entry to make more room."
                : "This browser is blocking storage for this site (a privacy setting or private browsing can cause this), so nothing you enter can persist. Refreshing or closing this tab will lose it — export a backup to keep your work."}
            </p>
            <button
              onClick={() => setExportPickerOpen(true)}
              className="btn btn-danger shrink-0 whitespace-nowrap"
            >
              Export backup now
            </button>
          </div>
        </div>
      )}

      <Toast
        tone="success"
        message={
          autoFreedStorage
            ? `Your browser's storage was almost full, so ${autoFreedStorage.migratedCount} photo${
                autoFreedStorage.migratedCount === 1 ? '' : 's'
              } ${autoFreedStorage.migratedCount === 1 ? 'was' : 'were'} automatically moved to free up about ${formatBytes(
                autoFreedStorage.bytesFreed
              )} — nothing was lost, and nothing else needs doing.`
            : null
        }
        onDismiss={clearAutoFreedStorage}
      />

      {/* 3i's forward-only roster sync, surfaced — same no-action-needed
          Toast pattern as autoFreedStorage above. One item: names it
          directly; several at once (one log entry can link more than one
          roster item): a short joined list, still one line. */}
      <Toast
        tone="success"
        message={
          rosterStatusSync && rosterStatusSync.length > 0
            ? `Roster updated: ${rosterStatusSync
                .map((c) => `${c.itemName} → ${STATUS_LABELS[c.status]}`)
                .join(', ')}`
            : null
        }
        onDismiss={clearRosterStatusSync}
      />

      <main className="flex-1 px-6 md:px-10 py-8 bg-deepwater-2">
        <Outlet />
      </main>

      <footer className="px-6 md:px-10 py-5 border-t border-moss/20 bg-gradient-to-b from-deepwater-2 to-[#0a1f1c] flex items-center justify-between gap-4">
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

      <ExportPickerModal
        open={exportPickerOpen}
        tanks={data.tanks}
        activeTank={activeTank}
        onExport={handleExport}
        onCancel={() => setExportPickerOpen(false)}
        isExporting={isExporting}
      />

      <DrivePickerModal
        open={drivePickerOpen}
        onUpload={() => {
          setDrivePickerOpen(false);
          setUploadConfirmOpen(true);
        }}
        onDownload={() => {
          setDrivePickerOpen(false);
          navigate('/new-tank', { state: { autoDownloadDrive: true } });
        }}
        onCancel={() => setDrivePickerOpen(false)}
      />

      <ConfirmModal
        open={uploadConfirmOpen}
        title="Overwrite your Google Drive backup?"
        message="This replaces whatever's currently in your Drive backup with this device's data right now. If another device has changes you haven't downloaded yet, they'll be gone from Drive — download from that device first if you're not sure."
        confirmLabel="Upload and overwrite"
        danger
        onConfirm={() => {
          setUploadConfirmOpen(false);
          handleUploadToDrive();
        }}
        onCancel={() => setUploadConfirmOpen(false)}
      />
    </div>
  );
}