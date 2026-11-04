import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LazyMotion, MotionConfig, LayoutGroup } from 'motion/react';
import RouteErrorBoundary, { NotFound } from './components/RouteError';
import { t } from './lib/i18n';
import useLang from './lib/useLang';

const Collection = lazy(() => import('./pages/Collection'));
const PerfectRun = lazy(() => import('./pages/PerfectRun'));
const Multiplayer = lazy(() => import('./pages/Multiplayer'));
const Legal = lazy(() => import('./pages/Legal'));
const BoardPrototype = lazy(() => import('./pages/BoardPrototype'));
const Club = lazy(() => import('./pages/Club'));
const PackLab = lazy(() => import('./pages/PackLab'));
const ChipLab = lazy(() => import('./pages/ChipLab'));
const TableLab = lazy(() => import('./pages/TableLab'));
const FxLab = lazy(() => import('./pages/FxLab'));
const ArenaLab = lazy(() => import('./pages/ArenaLab'));
const LandingLab = lazy(() => import('./pages/LandingLab'));

// domMax (not domAnimation) is required for layoutId and drag, both used by
// the card-surface morphs. Loaded as its own async chunk so it doesn't sit in
// the entry bundle; `strict` makes a bare `motion.div` throw, so every call
// site is forced onto the `m` namespace instead of drifting onto the (larger,
// non-tree-shaken) full import.
const loadFeatures = () => import('../shared/src/lib/motionFeatures').then(mod => mod.default);

export default function App() {
  // Subscribed here so a language change re-renders the whole tree in place.
  // Remounting instead would throw away a run in progress.
  useLang();
  return (
    <LazyMotion features={loadFeatures} strict>
      {/* reducedMotion="user" is the fix for the gap the CSS-only
          `prefers-reduced-motion` kill in index.css can't cover: that kill
          only neutralises CSS transitions/animations, and Framer Motion
          animates via WAAPI + inline styles, neither of which it touches. */}
      <MotionConfig reducedMotion="user">
        {/* LayoutGroup at the root so layoutId survives createPortal - React
            context flows through a portal even though the DOM node doesn't,
            which the dock/sheet/overlay card morphs depend on. */}
        <LayoutGroup>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <RouteErrorBoundary>
              <Suspense fallback={<div className="route-loading" role="status">{t('Loading game…')}</div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/club" replace />} />
                  {/* Renamed from /collection - kept as a redirect so old links still work. */}
                  <Route path="/collection" element={<Navigate to="/cards" replace />} />
                  <Route path="/cards" element={<Collection />} />
                  <Route path="/prematch" element={<Navigate to="/run" replace />} />
                  <Route path="/match" element={<Navigate to="/run" replace />} />
                  <Route path="/pack" element={<Navigate to="/run" replace />} />
                  <Route path="/club" element={<Club />} />
                  <Route path="/run" element={<PerfectRun />} />
                  <Route path="/legal" element={<Legal />} />
                  <Route path="/board" element={<BoardPrototype />} />
                                    <Route path="/lab/pack" element={<PackLab />} />
                  <Route path="/lab/chips" element={<ChipLab />} />
                  <Route path="/lab/table" element={<TableLab />} />
                  <Route path="/lab/fx" element={<FxLab />} />
                  <Route path="/lab/arena" element={<ArenaLab />} />
                  <Route path="/lab/landing" element={<LandingLab />} />
                  <Route path="/multiplayer" element={<Multiplayer />} />
                  <Route path="/lobby/:code" element={<Multiplayer />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </BrowserRouter>
        </LayoutGroup>
      </MotionConfig>
    </LazyMotion>
  );
}
