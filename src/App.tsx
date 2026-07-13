import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { DataProvider, useData } from './lib/DataContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Roster from './pages/Roster';
import Checklist from './pages/Checklist';
import Log from './pages/Log';
import Schedule from './pages/Schedule';
import Charts from './pages/Charts';
import Settings from './pages/Settings';
import CreateTank from './pages/CreateTank';
import JsonDocs from './pages/JsonDocs';

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
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/log" element={<Log />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/charts" element={<Charts />} />
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
        <AppShell />
      </HashRouter>
    </DataProvider>
  );
}
