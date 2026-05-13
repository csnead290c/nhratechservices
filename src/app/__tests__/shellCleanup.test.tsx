/**
 * NHRATS Shell Cleanup Tests
 *
 * Validates that nhratechservices.com shows only NHRA tools — no RSA
 * simulator, vehicle manager, race team, subscription, or pricing content.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('NHRATS Shell Cleanup — Blocked RSA routes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const RSA_ROUTES = [
    '/vehicles',
    '/et-sim',
    '/predict',
    '/engine-sim',
    '/engine-sim-legacy',
    '/engine-pro',
    '/log',
    '/history',
    '/dial-in',
    '/opponents',
    '/race-day',
    '/import',
    '/tech-card',
    '/ladder',
    '/clutch-sim',
    '/converter-sim',
    '/suspension-sim',
    '/team',
    '/parts',
    '/events',
    '/maintenance',
    '/expenses',
    '/about',
    '/pricing',
    '/calculators',
    '/calcs',
    '/register',
  ];

  RSA_ROUTES.forEach((route) => {
    it(`blocks direct access to ${route} — renders NotFound`, async () => {
      window.history.pushState({}, '', route);
      render(<App />);
      expect(await screen.findByText('Page Not Found')).toBeInTheDocument();
    });
  });
});

describe('NHRATS Shell Cleanup — Nav contains no RSA links', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('nav does not link to /vehicles', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const links = screen.getAllByRole('link');
    const hrefs = links.map((a) => (a as HTMLAnchorElement).pathname);
    expect(hrefs).not.toContain('/vehicles');
  });

  it('nav does not link to /et-sim', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const links = screen.getAllByRole('link');
    const hrefs = links.map((a) => (a as HTMLAnchorElement).pathname);
    expect(hrefs).not.toContain('/et-sim');
  });

  it('nav does not link to /engine-sim', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const links = screen.getAllByRole('link');
    const hrefs = links.map((a) => (a as HTMLAnchorElement).pathname);
    expect(hrefs).not.toContain('/engine-sim');
  });

  it('hamburger menu does not show Calculators link', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const moreBtn = screen.getByLabelText('More menu');
    fireEvent.click(moreBtn);
    expect(screen.queryByRole('link', { name: /calculators/i })).toBeNull();
  });

  it('hamburger menu does not show About link', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const moreBtn = screen.getByLabelText('More menu');
    fireEvent.click(moreBtn);
    expect(screen.queryByRole('link', { name: /^about$/i })).toBeNull();
  });
});

describe('NHRATS Shell Cleanup — Landing page', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('landing has no Quarter Jr/Pro content', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/Quarter Jr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quarter Pro/i)).not.toBeInTheDocument();
  });

  it('landing has no Engine Sim content', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/Engine Jr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engine Pro/i)).not.toBeInTheDocument();
  });

  it('landing has no subscription pricing', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/\$9\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$24\.99/)).not.toBeInTheDocument();
  });

  it('landing has no Racing Systems Analysis copy', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/Racing Systems Analysis/i)).not.toBeInTheDocument();
  });

  it('landing shows Sign In link to /login', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
  });
});
