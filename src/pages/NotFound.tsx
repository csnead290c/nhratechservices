import { Link } from 'react-router-dom';
import { useAuth } from '../domain/auth';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  isInternalUser,
  buildVisibilityContext,
} from '../domain/ui/publicSurface';

interface ModuleLink {
  to: string;
  label: string;
  icon: string;
  requiresCap?: string;
}

export default function NotFound() {
  const { user } = useAuth();
  const { can, plan } = useCapabilities();
  const internal = isInternalUser(buildVisibilityContext(user?.roleId));
  const showInternalLinks = user?.roleId === 'owner' || user?.roleId === 'admin';
  const isNhraUser = plan === 'nhra';

  // NHRA Tech Services modules (shown for NHRA users or as primary modules)
  const nhratsModules: ModuleLink[] = [
    { to: '/parity', label: 'Parity & Performance', icon: '📊', requiresCap: 'nhra.parity' },
    { to: '/tech', label: 'Tech Master', icon: '🔍', requiresCap: 'nhra.tech.read' },
    { to: '/rules', label: 'Rules & Governance', icon: '📋', requiresCap: 'rules.read' },
    { to: '/account', label: 'Account', icon: '👤' },
  ];

  // Filter modules by capability if user is logged in
  const availableModules = isNhraUser
    ? nhratsModules.filter(m => !m.requiresCap || can(m.requiresCap as any))
    : nhratsModules.filter(m => !m.requiresCap); // For non-NHRA, show only public modules

  // Add admin link for admin users
  if (showInternalLinks) {
    availableModules.push({ to: '/admin', label: 'Admin Portal', icon: '⚙️' });
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '420px',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem', lineHeight: 1 }}>🧭</div>
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: 'var(--color-text)' }}>
        Page Not Found
      </h2>
      <p
        style={{
          color: 'var(--color-muted)',
          maxWidth: '520px',
          marginBottom: '1.5rem',
          lineHeight: 1.5,
          fontSize: '0.9rem',
        }}
      >
        That route doesn&apos;t exist. Here are the core modules available in NHRA Tech Services:
      </p>

      <div
        data-testid="nhrats-notfound-modules"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.5rem',
          width: '100%',
          maxWidth: '520px',
          marginBottom: internal ? '1.25rem' : '0',
        }}
      >
        {availableModules.map((mod) => (
          <Link
            key={mod.to}
            to={mod.to}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{mod.icon}</span>
            {mod.label}
          </Link>
        ))}
      </div>

      {showInternalLinks && (
        <div
          style={{
            width: '100%',
            maxWidth: '520px',
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--color-border)',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Internal links
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link
              to="/dev"
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '999px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                textDecoration: 'none',
                fontSize: '0.75rem',
              }}
            >
              /dev
            </Link>
            <Link
              to="/incidents"
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '999px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                textDecoration: 'none',
                fontSize: '0.75rem',
              }}
            >
              /incidents
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
