import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { lazy, useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { ThemeProvider } from '../shared/ui/theme';
import { Vb6FixtureProvider } from '../shared/state/vb6FixtureStore';
import { FlagsProvider } from '../domain/flags/store.tsx';
import { VehicleProvider } from '../state/vehicleStore';
import { AuthProvider } from '../domain/auth';
import { RunHistoryProvider } from '../shared/state/runHistoryStore';
import { PreferencesProvider } from '../shared/state/preferences';
import ViewAsBanner from '../domain/config/ViewAsBanner';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Account from '../pages/Account';
import ResetPassword from '../pages/ResetPassword';
import NotFound from '../pages/NotFound';
import Help from '../pages/Help';
import ThemeToggle from '../shared/components/ThemeToggle';
import ProtectedRoute from '../shared/components/ProtectedRoute';
import CapabilityRoute from '../shared/components/CapabilityRoute';
import InternalRoute from '../shared/components/InternalRoute';
import { useAuth } from '../domain/auth';
import { useCapabilities } from '../domain/config/useCapabilities';
import { isInternalUser, buildVisibilityContext } from '../domain/ui/publicSurface';

// DevPortal - available in dev mode or to owner/admin in production
const DevPortal = lazy(() => import('../pages/DevPortal'));
const AdminPortal = lazy(() => import('../pages/AdminPortal'));
const ParityPortal = lazy(() => import('../pages/ParityPortal'));
const ParityIdrViewer = lazy(() => import('../pages/ParityIdrViewer'));
const IncidentAnalysis = lazy(() => import('../pages/IncidentAnalysis'));
const TechMasterShell = lazy(() => import('../pages/TechMasterShell'));
const RulesList = lazy(() => import('../pages/RulesList'));
const RuleDetail = lazy(() => import('../pages/RuleDetail'));
const RulesCommitteesList = lazy(() => import('../pages/RulesCommitteesList'));
const RulesCommitteeDetail = lazy(() => import('../pages/RulesCommitteeDetail'));
const EventOpsList = lazy(() => import('../pages/EventOpsList'));
const EventPlanDetail = lazy(() => import('../pages/EventPlanDetail'));
const EventPrePlanEditor = lazy(() => import('../pages/EventPrePlanEditor'));
const EventLiveChecklist = lazy(() => import('../pages/EventLiveChecklist'));
const EventPostReportBuilder = lazy(() => import('../pages/EventPostReportBuilder'));
const EventPostReportDetail = lazy(() => import('../pages/EventPostReportDetail'));

function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  
  if (!isAuthenticated || !user) {
    return (
      <Link
        to="/login"
        style={{
          color: 'var(--color-header-text)',
          textDecoration: 'none',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        Sign In
      </Link>
    );
  }
  
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          color: 'var(--color-header-text)',
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <span style={{ fontSize: '0.875rem' }}>{user.displayName}</span>
      </button>
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            minWidth: '150px',
            zIndex: 100,
          }}
        >
          <Link
            to="/account"
            onClick={() => setShowMenu(false)}
            style={{
              display: 'block',
              padding: '0.75rem 1rem',
              color: 'var(--color-text)',
              textDecoration: 'none',
            }}
          >
            My Account
          </Link>
          <button
            onClick={() => { logout(); setShowMenu(false); }}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.75rem 1rem',
              textAlign: 'left',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-accent)',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function Navigation() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, forceUpdate] = useState(0);
  const menuRef = useRef<HTMLElement>(null);

  // Listen for products update event to re-render navigation
  useEffect(() => {
    const handleProductsUpdate = () => { forceUpdate(n => n + 1); };
    window.addEventListener('nhrats-products-updated', handleProductsUpdate);
    return () => window.removeEventListener('nhrats-products-updated', handleProductsUpdate);
  }, []);

  // Close menu on ESC key
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    color: 'var(--color-header-text)',
    textDecoration: 'none',
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
    fontSize: '0.8rem',
    fontWeight: active ? 600 : 400,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  });

  const isLoggedIn = isAuthenticated;
  const visCtxNav = buildVisibilityContext(user?.roleId);
  const isDevOrOwner = isInternalUser(visCtxNav);

  // Check access for each nav item using capability system
  const { can } = useCapabilities();

  // NHRA navigation capabilities
  const canAccessParity = isLoggedIn && can('nhra.parity');
  const canAccessTechMaster = isLoggedIn && can('nhra.tech.read');
  const canAccessRules = isLoggedIn && can('rules.read');
  const canAccessEventOps = isLoggedIn && can('eventops.read');

  const close = useCallback(() => setMenuOpen(false), []);

  // ── Primary links: always visible in desktop top bar ──
  // On nhratechservices.com all users see NHRA nav regardless of plan.
  const primaryLinks = (
    <>
      <Link to="/" style={navLinkStyle(isActive('/'))} onClick={close}>Home</Link>
      {canAccessParity && (
        <Link to="/parity" style={navLinkStyle(isActive('/parity'))} onClick={close}>Parity</Link>
      )}
      {canAccessTechMaster && (
        <Link to="/tech" style={navLinkStyle(isActive('/tech'))} onClick={close}>Tech Master</Link>
      )}
      {canAccessRules && (
        <Link to="/rules" style={navLinkStyle(isActive('/rules'))} onClick={close}>Rules</Link>
      )}
      {canAccessEventOps && (
        <Link to="/event-ops" style={navLinkStyle(isActive('/event-ops'))} onClick={close}>Event Ops</Link>
      )}
    </>
  );

  // ── Secondary links: hamburger menu only ──
  // nhratechservices.com shows NHRA tools only in secondary menu.
  const secondaryLinks = (
    <>
      <Link to="/help" style={navLinkStyle(isActive('/help'))} onClick={close}>Help</Link>
      {isDevOrOwner && (
        <>
          <AdminNavLink isActive={isActive} navLinkStyle={navLinkStyle} />
          <DevNavLink isActive={isActive} navLinkStyle={navLinkStyle} />
        </>
      )}
    </>
  );

  return (
    <>
      {/* Desktop nav — primary links only */}
      <nav className="nhrats-desktop-nav" style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        {primaryLinks}
        {/* Hamburger for secondary items — always visible on desktop too */}
        <button
          className="nhrats-more-btn"
          onClick={() => setMenuOpen(o => !o)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-header-text)',
            fontSize: '1.1rem',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            lineHeight: 1,
          }}
          aria-label="More menu"
          aria-expanded={menuOpen}
          title="More"
        >
          ☰
        </button>
      </nav>

      {/* Mobile hamburger button — replaces entire nav on small screens */}
      <button
        className="nhrats-mobile-btn"
        onClick={() => setMenuOpen(o => !o)}
        style={{
          display: 'none',
          background: 'none',
          border: 'none',
          color: 'var(--color-header-text)',
          fontSize: '1.5rem',
          cursor: 'pointer',
          padding: '4px 8px',
        }}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Backdrop — click outside to close */}
      {menuOpen && (
        <div
          data-testid="nhrats-menu-backdrop"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
          }}
        />
      )}

      {/* Dropdown menu (shared by desktop "more" and mobile hamburger) */}
      {menuOpen && (
        <nav
          ref={menuRef}
          className="nhrats-dropdown-nav"
          data-testid="nhrats-dropdown-nav"
          style={{
            position: 'absolute',
            top: '100%',
            right: '1rem',
            minWidth: '180px',
            backgroundColor: 'var(--color-header-bg)',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxShadow: 'var(--shadow-lg)',
            borderRadius: '0 0 8px 8px',
            zIndex: 1000,
          }}
        >
          {/* On mobile, show primary links too */}
          <div className="nhrats-dropdown-primary">
            {primaryLinks}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />
          </div>
          {secondaryLinks}
        </nav>
      )}

      {/* Responsive styles */}
      <style>{`
        /* Desktop: show desktop nav, hide mobile button */
        .nhrats-mobile-btn { display: none !important; }
        .nhrats-dropdown-primary { display: none; }

        /* ≤900px: hide desktop nav, show mobile button, show primary links in dropdown */
        @media (max-width: 900px) {
          .nhrats-desktop-nav { display: none !important; }
          .nhrats-mobile-btn { display: block !important; }
          .nhrats-dropdown-primary { display: block; }
        }
      `}</style>
    </>
  );
}

function AdminNavLink({ isActive, navLinkStyle }: { isActive: (path: string) => boolean; navLinkStyle: (active: boolean) => React.CSSProperties }) {
  const { user } = useAuth();
  const isOwnerOrAdmin = user?.roleId === 'owner' || user?.roleId === 'admin';
  
  if (!isOwnerOrAdmin) {
    return null;
  }
  
  return (
    <Link to="/admin" style={navLinkStyle(isActive('/admin'))}>
      Admin
    </Link>
  );
}

function DevNavLink({ isActive, navLinkStyle }: { isActive: (path: string) => boolean; navLinkStyle: (active: boolean) => React.CSSProperties }) {
  const { user } = useAuth();
  const isOwnerOrAdmin = user?.roleId === 'owner' || user?.roleId === 'admin';
  
  if (!import.meta.env.DEV && !isOwnerOrAdmin) {
    return null;
  }
  
  return (
    <Link to="/dev" style={navLinkStyle(isActive('/dev'))}>
      Dev
    </Link>
  );
}

function NhraHomeRedirect() {
  return <Home />;
}

// Redirect NHRA-only users away from any page they shouldn't be on.
const NHRA_ALLOWED_PREFIXES = [
  '/parity',
  '/tech',
  '/rules',
  '/event-ops',
  '/admin',
  '/dev',
  '/account',
  '/login',
  '/help',
  '/not-found',
];

function NhraPageGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { plan } = useCapabilities();
  if (isAuthenticated && plan === 'nhra') {
    const ok = NHRA_ALLOWED_PREFIXES.some(
      p => location.pathname === p || location.pathname.startsWith(p + '/'),
    );
    if (!ok) return <Navigate to="/parity" replace />;
  }
  return <>{children}</>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'relative',
          backgroundColor: 'var(--color-header-bg)',
          color: 'var(--color-header-text)',
          padding: '0.75rem 1.5rem',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
          <img src="/nhra-tech-services-logo.svg" alt="NHRA Tech Services" style={{ height: '40px', width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', overflow: 'hidden' }}>
          <Navigation />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main style={{ flex: 1 }}><NhraPageGuard>{children}</NhraPageGuard></main>

      <footer
        style={{
          backgroundColor: 'var(--color-surface)',
          padding: 'var(--space-4) var(--space-6)',
          textAlign: 'center',
          color: 'var(--color-muted)',
          fontSize: '0.875rem',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        NHRA Tech Services © 2026
      </footer>
      <ViewAsBanner />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <FlagsProvider>
        <AuthProvider>
          <PreferencesProvider>
          <VehicleProvider>
            <RunHistoryProvider>
            <Vb6FixtureProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppShell>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<NhraHomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/help" element={<Help />} />
            {/* RSA-only public routes — blocked on nhratechservices.com */}
            <Route path="/about" element={<NotFound />} />
            <Route path="/register" element={<NotFound />} />
            <Route path="/pricing" element={<NotFound />} />
            <Route path="/calculators" element={<NotFound />} />
            <Route path="/calcs" element={<NotFound />} />
            
            {/* Protected routes - require auth */}
            <Route path="/account" element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            } />
            
            {/* RSA-only routes — blocked on nhratechservices.com */}
            <Route path="/vehicles" element={<NotFound />} />
            <Route path="/et-sim" element={<NotFound />} />
            <Route path="/predict" element={<NotFound />} />
            <Route path="/log" element={<NotFound />} />
            <Route path="/history" element={<NotFound />} />
            <Route path="/dial-in" element={<NotFound />} />
            <Route path="/opponents" element={<NotFound />} />
            <Route path="/race-day" element={<NotFound />} />
            <Route path="/import" element={<NotFound />} />
            <Route path="/tech-card" element={<NotFound />} />
            <Route path="/ladder" element={<NotFound />} />
            <Route path="/clutch-sim" element={<NotFound />} />
            <Route path="/converter-sim" element={<NotFound />} />
            <Route path="/engine-sim" element={<NotFound />} />
            <Route path="/engine-sim-legacy" element={<NotFound />} />
            <Route path="/engine-pro" element={<NotFound />} />
            <Route path="/suspension-sim" element={<NotFound />} />
            <Route path="/team" element={<NotFound />} />
            <Route path="/parts" element={<NotFound />} />
            <Route path="/events" element={<NotFound />} />
            <Route path="/maintenance" element={<NotFound />} />
            <Route path="/expenses" element={<NotFound />} />
            
            {/* Admin Portal - internal only (owner/admin) */}
            <Route path="/admin" element={
              <ProtectedRoute requireRole={['owner', 'admin']}>
                <InternalRoute>
                  <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                    <AdminPortal />
                  </Suspense>
                </InternalRoute>
              </ProtectedRoute>
            } />
            
            {/* Dev Portal - internal only (owner/admin or DEV mode) */}
            <Route path="/dev" element={
              <ProtectedRoute requireRole={['owner', 'admin']}>
                <InternalRoute>
                  <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                    <DevPortal />
                  </Suspense>
                </InternalRoute>
              </ProtectedRoute>
            } />

            {/* Incident Analysis — telemetry + video review workspace */}
            <Route path="/parity/analysis/:incidentId" element={
              <CapabilityRoute requireCap="incidents.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <IncidentAnalysis />
                </Suspense>
              </CapabilityRoute>
            } />

            {/* IDR Viewer — reached from incident links */}
            <Route path="/parity/idr" element={
              <CapabilityRoute requireCap="nhra.parity">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <ParityIdrViewer />
                </Suspense>
              </CapabilityRoute>
            } />

            {/* NHRA Tech Master - capability-gated at route level */}
            <Route path="/tech" element={
              <CapabilityRoute requireCap="nhra.tech.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <TechMasterShell />
                </Suspense>
              </CapabilityRoute>
            } />

            {/* NHRA Tech Parity - capability-gated at route level */}
            <Route path="/parity" element={
              <CapabilityRoute requireCap="nhra.parity">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <ParityPortal />
                </Suspense>
              </CapabilityRoute>
            } />
            {/* Rules & Governance routes */}
            <Route path="/rules/:id" element={
              <CapabilityRoute requireCap="rules.read">
                <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
                  <RuleDetail />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/rules" element={
              <CapabilityRoute requireCap="rules.read">
                <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
                  <RulesList />
                </Suspense>
              </CapabilityRoute>
            } />
            {/* Rules Committees routes */}
            <Route path="/rules/committees/:id" element={
              <CapabilityRoute requireCap="committees.read">
                <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
                  <RulesCommitteeDetail />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/rules/committees" element={
              <CapabilityRoute requireCap="committees.read">
                <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
                  <RulesCommitteesList />
                </Suspense>
              </CapabilityRoute>
            } />

            {/* Event Operations routes */}
            <Route path="/event-ops" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventOpsList />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/event-ops/:id" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventPlanDetail />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/event-ops/:id/pre-plan" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventPrePlanEditor />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/event-ops/:id/live" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventLiveChecklist />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/event-ops/:id/post-report" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventPostReportBuilder />
                </Suspense>
              </CapabilityRoute>
            } />
            <Route path="/event-ops/reports/:reportId" element={
              <CapabilityRoute requireCap="eventops.read">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <EventPostReportDetail />
                </Suspense>
              </CapabilityRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppShell>
            </BrowserRouter>
            </Vb6FixtureProvider>
            </RunHistoryProvider>
          </VehicleProvider>
          </PreferencesProvider>
        </AuthProvider>
      </FlagsProvider>
    </ThemeProvider>
  );
}

export default App;
