import { Link } from 'react-router-dom';
import Page from '../shared/components/Page';
import { useAuth } from '../domain/auth';
import { useCapabilities } from '../domain/config/useCapabilities';
import Landing from './Landing';

interface ModuleCardProps {
  to: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

function ModuleCard({ to, title, description, icon, color }: ModuleCardProps) {
  return (
    <Link
      to={to}
      className="card"
      style={{
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1.25rem',
        background: `linear-gradient(135deg, ${color}15, ${color}08)`,
        borderLeft: `3px solid ${color}`,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.75rem' }}>{icon}</span>
        <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '1.05rem', fontWeight: 600 }}>
          {title}
        </h4>
      </div>
      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
        {description}
      </p>
    </Link>
  );
}

function NhratsDashboard() {
  const { user } = useAuth();
  const { can } = useCapabilities();

  const isAdmin = user?.roleId === 'owner' || user?.roleId === 'admin';

  // Core NHRA modules available to all NHRA users
  const coreModules: ModuleCardProps[] = [
    {
      to: '/parity',
      title: 'Parity & Performance',
      description: 'Race event data, weather correction, and performance analysis tools.',
      icon: '📊',
      color: '#dc2626',
    },
  ];

  // Capability-gated modules
  if (can('nhra.tech.read')) {
    coreModules.push({
      to: '/tech',
      title: 'Tech Master',
      description: 'Technical inspections, checklists, and compliance tracking.',
      icon: '🔍',
      color: '#2563eb',
    });
  }

  if (can('rules.read')) {
    coreModules.push({
      to: '/rules',
      title: 'Rules & Governance',
      description: 'Rulebook, versions, and technical regulations reference.',
      icon: '📋',
      color: '#059669',
    });
  }

  // Admin-only modules
  const adminModules: ModuleCardProps[] = [];
  if (isAdmin) {
    adminModules.push({
      to: '/admin',
      title: 'Admin Portal',
      description: 'System administration, user management, and configuration.',
      icon: '⚙️',
      color: '#7c3aed',
    });
  }

  return (
    <Page title="">
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1rem' }}>
        {/* Welcome Header */}
        <div style={{ marginBottom: '2rem', paddingTop: '1rem' }}>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
            Welcome back{user?.displayName ? `, ${user.displayName}` : ''}
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '1rem', margin: 0 }}>
            NHRA Tech Services Dashboard
          </p>
        </div>

        {/* Core Modules */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', fontWeight: 600 }}>
            Core Modules
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {coreModules.map((mod) => (
              <ModuleCard key={mod.to} {...mod} />
            ))}
          </div>
        </section>

        {/* Admin Section */}
        {adminModules.length > 0 && (
          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', fontWeight: 600 }}>
              Administration
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}
            >
              {adminModules.map((mod) => (
                <ModuleCard key={mod.to} {...mod} />
              ))}
            </div>
          </section>
        )}

        {/* Help Link */}
        <section style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
            Need assistance? Visit the{' '}
            <Link to="/help" style={{ color: 'var(--color-primary)' }}>
              Help Center
            </Link>{' '}
            or contact support.
          </p>
        </section>
      </div>
    </Page>
  );
}

function Home() {
  const { isAuthenticated, user } = useAuth();
  const { plan } = useCapabilities();

  // Show landing page for non-authenticated users
  if (!isAuthenticated) {
    return <Landing />;
  }

  // Show NHRATS dashboard for NHRA plan users
  if (plan === 'nhra') {
    return <NhratsDashboard />;
  }

  // For non-NHRA authenticated users, show a simple dashboard
  // (preserving minimal RSA functionality for any remaining non-NHRA users)
  return (
    <Page title="">
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          Welcome back{user?.displayName ? `, ${user.displayName}` : ''}
        </h1>
        <p style={{ color: 'var(--color-muted)' }}>
          Access your tools from the navigation menu above.
        </p>
      </div>
    </Page>
  );
}

export default Home;
