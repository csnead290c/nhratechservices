import { Link } from 'react-router-dom';
import { useTheme } from '../shared/ui/theme';

/**
 * Public landing page for unauthenticated users on nhratechservices.com.
 * Clean NHRA Technical Services branding only — no RSA/racer content.
 */
export default function Landing() {
  const { theme } = useTheme();
  const logoSrc = theme === 'dark' ? '/nhra-tech-services-logo-dark.svg' : '/nhra-tech-services-logo-light.svg';
  return (
    <div
      data-testid="nhrats-landing"
      style={{
        minHeight: '60vh',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
      }}
    >
      <img
        src={logoSrc}
        alt="NHRA Tech Services"
        style={{ height: '72px', marginBottom: '28px' }}
      />
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text)' }}>
        NHRA Tech Services
      </h1>
      <p style={{ fontSize: '1rem', color: 'var(--color-muted)', maxWidth: '480px', lineHeight: 1.6, marginBottom: '32px' }}>
        Internal tools for NHRA technical staff — parity analysis, inspections,
        rules governance, and more.
      </p>
      <Link
        to="/login"
        style={{
          padding: '12px 28px',
          backgroundColor: 'var(--color-primary, #262E87)',
          color: 'white',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '1rem',
        }}
      >
        Sign In
      </Link>
    </div>
  );
}
