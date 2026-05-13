import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('NotFound routing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders NotFound for unknown routes', async () => {
    window.history.pushState({}, '', '/this-does-not-exist');
    render(<App />);
    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders NotFound copy referencing NHRA Tech Services', async () => {
    window.history.pushState({}, '', '/this-does-not-exist');
    render(<App />);
    await screen.findByText('Page Not Found');
    const matches = screen.getAllByText(/NHRA Tech Services/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('does NOT show RSA routes in NotFound links', async () => {
    window.history.pushState({}, '', '/this-does-not-exist');
    render(<App />);
    await screen.findByText('Page Not Found');
    const links = screen.getAllByRole('link');
    const hrefs = links.map((a) => (a as HTMLAnchorElement).href);
    const paths = hrefs.map((h) => { try { return new URL(h).pathname; } catch { return h; } });
    expect(paths).not.toContain('/history');
    expect(paths).not.toContain('/log');
    expect(paths).not.toContain('/team');
    expect(paths).not.toContain('/vehicles');
    expect(paths).not.toContain('/et-sim');
    expect(paths).not.toContain('/engine-sim');
  });

  it('does NOT show Internal links section for public users', async () => {
    window.history.pushState({}, '', '/this-does-not-exist');
    render(<App />);
    await screen.findByText('Page Not Found');
    expect(screen.queryByText('Internal links')).toBeNull();
  });

  it('renders NotFound for blocked RSA routes like /vehicles', async () => {
    window.history.pushState({}, '', '/vehicles');
    render(<App />);
    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders NotFound for blocked RSA route /et-sim', async () => {
    window.history.pushState({}, '', '/et-sim');
    render(<App />);
    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders NotFound for blocked RSA route /engine-sim', async () => {
    window.history.pushState({}, '', '/engine-sim');
    render(<App />);
    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders NotFound for blocked RSA route /race-day', async () => {
    window.history.pushState({}, '', '/race-day');
    render(<App />);
    expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
  });
});
