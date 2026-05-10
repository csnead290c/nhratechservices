/**
 * NHRATS NotFound Page Tests
 *
 * Validates that NotFound page shows NHRA Tech Services copy
 * and NHRATS module links instead of RSA content
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../NotFound';
import * as authModule from '../../domain/auth';
import * as capabilitiesModule from '../../domain/config/useCapabilities';

// Mock dependencies
vi.mock('../../domain/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../domain/config/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

describe('NHRATS NotFound Page', () => {
  it('shows NHRA Tech Services copy instead of RSA', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'user' },
    } as any);

    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: vi.fn(() => true),
      plan: 'nhra',
      capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    // Should show NHRA Tech Services copy
    expect(screen.getByText(/core modules available in NHRA Tech Services/)).toBeInTheDocument();

    // Should NOT show RSA copy
    expect(screen.queryByText(/core modules available in RSA/)).not.toBeInTheDocument();
  });

  it('shows NHRATS module links (Parity, Tech Master, Rules, Account)', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'user' },
    } as any);

    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: vi.fn(() => true),
      plan: 'nhra',
      capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    // Check for NHRATS module links
    expect(screen.getByText('Parity & Performance')).toBeInTheDocument();
    expect(screen.getByText('Tech Master')).toBeInTheDocument();
    expect(screen.getByText('Rules & Governance')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('does NOT show old RSA module links (Quarter, Engine, Vehicles)', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'user' },
    } as any);

    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: vi.fn(() => true),
      plan: 'nhra',
      capabilities: new Set(['nhra.parity']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    // Should NOT show old RSA links
    expect(screen.queryByText(/Quarter/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engine/)).not.toBeInTheDocument();
    expect(screen.queryByText('Vehicles')).not.toBeInTheDocument();
  });

  it('filters modules by capability for NHRA users', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'user' },
    } as any);

    // User only has parity access, not tech or rules
    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: (cap: string) => cap === 'nhra.parity',
      plan: 'nhra',
      capabilities: new Set(['nhra.parity']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    // Should show Parity
    expect(screen.getByText('Parity & Performance')).toBeInTheDocument();

    // Should NOT show Tech Master or Rules (no capabilities)
    expect(screen.queryByText('Tech Master')).not.toBeInTheDocument();
    expect(screen.queryByText('Rules & Governance')).not.toBeInTheDocument();
  });

  it('shows Admin Portal link for admin users', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'admin' },
    } as any);

    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: vi.fn(() => true),
      plan: 'nhra',
      capabilities: new Set(['nhra.parity']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Portal')).toBeInTheDocument();
  });

  it('shows Internal links section for admin users', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { displayName: 'Test User', roleId: 'admin' },
    } as any);

    vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
      can: vi.fn(() => true),
      plan: 'nhra',
      capabilities: new Set(['nhra.parity']),
    } as any);

    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText('Internal links')).toBeInTheDocument();
  });
});
