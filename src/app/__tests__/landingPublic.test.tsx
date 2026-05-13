import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('Landing page (logged-out)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('shows NHRA Tech Services branding', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.getByText('NHRA Tech Services')).toBeInTheDocument();
  });

  it('shows Sign In link', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
  });

  it('does NOT show RSA racer content', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/Quarter Jr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engine Jr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Turn On More Win Lights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/race team/i)).not.toBeInTheDocument();
  });

  it('does NOT show subscription pricing content', async () => {
    render(<App />);
    await screen.findByTestId('nhrats-landing');
    expect(screen.queryByText(/\$9\.99/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$24\.99/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Racer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Most Popular/i)).not.toBeInTheDocument();
  });
});
