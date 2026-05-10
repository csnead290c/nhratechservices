/**
 * Mobile Navigation Component
 * 
 * Bottom navigation bar for mobile devices with quick access to key features.
 * Respects NHRA-only users: shows Parity-focused nav instead of RSA sim tools.
 * NOTE: This component is not currently imported in the app; the desktop
 * Navigation in App.tsx handles all nav rendering including mobile.
 */

import { Link, useLocation } from 'react-router-dom';
import { useIsMobile } from '../hooks/useResponsive';
import { useCapabilities } from '../../domain/config/useCapabilities';
import { useAuth } from '../../domain/auth';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const RSA_NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/predict', label: 'Sim', icon: '🏎️' },
  { path: '/history', label: 'Runs', icon: '📝' },
  { path: '/race-day', label: 'Race', icon: '🏁' },
  { path: '/calculators', label: 'Calcs', icon: '🔢' },
];

const NHRA_NAV_ITEMS: NavItem[] = [
  { path: '/parity', label: 'Parity', icon: '📊' },
  { path: '/tech', label: 'Tech', icon: '🔍' },
  { path: '/rules', label: 'Rules', icon: '📋' },
  { path: '/help', label: 'Help', icon: '❓' },
];

export default function MobileNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { can, plan } = useCapabilities();

  if (!isMobile) {
    return null;
  }

  const isNhraOnlyUser = isAuthenticated && plan === 'nhra';

  // Filter NHRA nav items by capability
  const items = isNhraOnlyUser
    ? NHRA_NAV_ITEMS.filter(item => {
        if (item.path === '/tech') return can('nhra.tech.read');
        if (item.path === '/rules') return can('rules.read');
        return true; // parity and help are always visible for NHRA users
      })
    : RSA_NAV_ITEMS;

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '8px 0',
      paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      zIndex: 1000,
    }}>
      {items.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '4px 12px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontSize: '0.7rem',
              fontWeight: isActive ? 600 : 400,
              transition: 'color 0.15s ease',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Spacer component to prevent content from being hidden behind mobile nav
 */
export function MobileNavSpacer() {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return <div style={{ height: '70px' }} />;
}
