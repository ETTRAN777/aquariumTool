import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { DataProvider, useData } from './lib/DataContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Roster from './pages/Roster';
import Targets from './pages/Targets';
import Checklist from './pages/Checklist';
import Log from './pages/Log';
import Timeline from './pages/Timeline';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';
import CreateTank from './pages/CreateTank';
import JsonDocs from './pages/JsonDocs';
import Analytics from './components/Analytics';

// recharts (plus its d3 sub-dependencies) is the single largest thing in
// this app's bundle by far — measured at ~369 kB raw / ~106 kB gzip on
// its own, roughly 45% of the whole build — and Charts is the ONLY page
// that imports it. Every other route pays that weight on first load for
// a chart most sessions won't even visit (Dashboard, not Charts, is the
// landing page). Lazy-loading just this one route keeps recharts out of
// the main bundle entirely; it only downloads the first time someone
// actually navigates to /charts.
const Charts = lazy(() => import('./pages/Charts'));

// Minimal, unobtrusive fallback shown only while the Charts chunk itself
// downloads — typically well under a second on a real connection, and
// only ever hit on a cold cache (repeat visits get it from the browser
// cache same as everything else). Matches the app's own design tokens
// rather than a generic spinner.
function ChartsLoadingFallback() {
  return (
    <div className="card p-6 text-sm text-foam-dim">Loading charts…</div>
  );
}

function NewTankRoute() {
  const navigate = useNavigate();
  return <CreateTank onDone={() => navigate('/')} />;
}

// Gatekeeps the main nav shell: no tank yet means no nav, no Dashboard,
// nothing but the onboarding flow. Once a tank exists, normal routing
// resumes. /docs is deliberately outside that gate — it's meant to be
// reachable from the onboarding screen itself, before a tank exists.
function AppShell() {
  const { activeTank } = useData();

  return (
    <Routes>
      <Route path="/docs" element={<JsonDocs />} />
      {!activeTank ? (
        <Route path="*" element={<CreateTank />} />
      ) : (
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/log" element={<Log />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route
            path="/charts"
            element={
              <Suspense fallback={<ChartsLoadingFallback />}>
                <Charts />
              </Suspense>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/new-tank" element={<NewTankRoute />} />
        </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <DataProvider>
      <HashRouter>
        <Analytics />
        <AppShell />
      </HashRouter>
    </DataProvider>
  );
}