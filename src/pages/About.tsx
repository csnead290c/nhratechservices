import Page from '../shared/components/Page';

function About() {
  return (
    <Page title="">
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Overview */}
        <div className="card mb-6">
          <h2 className="mb-4" style={{ fontSize: '1.5rem', color: 'var(--color-text)' }}>
            About NHRA Tech Services
          </h2>

          <p className="text-muted mb-4" style={{ fontSize: '0.95rem', lineHeight: '1.8' }}>
            NHRA Tech Services provides professional-grade drag racing simulation, data tools,
            and technical administrative resources purpose-built for the NHRA community. Our
            platform is trusted by racers, crew chiefs, engine builders, and technical officials
            to analyze performance, manage technical inspection, and make data-driven decisions.
          </p>

          <p className="text-muted mb-4" style={{ fontSize: '0.95rem', lineHeight: '1.8' }}>
            Built on decades of real-world physics modeling and race data, our simulation engine
            delivers the same proven accuracy that professional teams rely on — now accessible
            from any device in a modern, browser-based interface.
          </p>
        </div>

        {/* Tools */}
        <div className="card mb-6">
          <h2 className="mb-4" style={{ fontSize: '1.5rem', color: 'var(--color-text)' }}>
            Our Tools
          </h2>

          <div className="mb-4">
            <h3 className="mb-2" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-primary)' }}>
              Parity Portal
            </h3>
            <p className="text-muted mb-4" style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
              The NHRA Tech Parity Portal provides deep analysis of run data across classes, events,
              and drivers. Query corrected and uncorrected runs, compare engine combos, review weather
              impact, and investigate parity trends — all in one place.
            </p>
          </div>

          <div className="mb-4">
            <h3 className="mb-2" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-primary)' }}>
              Tech Master
            </h3>
            <p className="text-muted mb-4" style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
              A full technical inspection workflow — identity management, event entry rosters,
              scale records, tech cases, and findings — integrated with live run data for
              comprehensive event-day technical oversight.
            </p>
          </div>

          <div className="mb-4">
            <h3 className="mb-2" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-accent)' }}>
              More Coming Soon
            </h3>
            <p className="text-muted" style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
              Additional NHRA technical services tools are in active development. Stay tuned.
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="card mb-6">
          <h2 className="mb-4" style={{ fontSize: '1.5rem', color: 'var(--color-text)' }}>
            Contact Us
          </h2>

          <div style={{ fontSize: '0.95rem', lineHeight: '1.8' }}>
            <p className="text-muted mb-2">
              <strong>Email:</strong>{' '}
              <a href="mailto:support@nhratechservices.com" style={{ color: 'var(--color-accent)' }}>
                support@nhratechservices.com
              </a>
            </p>
          </div>
        </div>

      </div>
    </Page>
  );
}

export default About;
