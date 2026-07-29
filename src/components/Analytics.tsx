import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// GoatCounter's <script> tag in index.html only fires one pageview, on
// initial script load. This is a HashRouter SPA — every other navigation
// (Dashboard -> Roster -> Compatibility, etc.) happens client-side with no
// real page load, so without this, GoatCounter would only ever see "the
// site was opened once" and nothing about which pages people actually use.
//
// Renders nothing — it exists purely to call goatcounter.count() on every
// route change after the first, which the static script tag already
// covered.
declare global {
  interface Window {
    goatcounter?: {
      count?: (opts: { path?: string; title?: string; event?: boolean }) => void;
    };
  }
}

export default function Analytics() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.goatcounter?.count?.({
      path: location.pathname,
      title: document.title,
    });
  }, [location]);

  return null;
}
