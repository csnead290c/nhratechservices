/**
 * NHRATS Home Dashboard Tests
 *
 * Validates that NHRA users see NHRATS-specific dashboard
 * and NOT RSA simulator content (Quarter Pro, Engine Pro, Vehicles)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home';
import * as authModule from '../../domain/auth';
import * as capabilitiesModule from '../../domain/config/useCapabilities';

// Mock dependencies
vi.mock('../../domain/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../domain/config/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

vi.mock('../Landing', () => ({
  default: () => <div data-testid="landing-page">Landing Page</div>,
}));

describe('NHRATS Home Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NHRA authenticated users', () => {
    it('shows NHRA Tech Services dashboard heading', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByText('NHRA Tech Services Dashboard')).toBeInTheDocument();
    });

    it('does NOT show RSA Simulators section', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.queryByText('Simulators')).not.toBeInTheDocument();
      expect(screen.queryByText(/Quarter/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Engine/)).not.toBeInTheDocument();
    });

    it('does NOT show Your Vehicles section', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.queryByText('Your Vehicles')).not.toBeInTheDocument();
    });

    it('does NOT show Your Engines section', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity', 'nhra.tech.read', 'rules.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.queryByText('Your Engines')).not.toBeInTheDocument();
    });

    it('shows Parity & Performance module card', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByText('Parity & Performance')).toBeInTheDocument();
    });

    it('shows Tech Master module card when user has nhra.tech.read', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: (cap: string) => cap === 'nhra.tech.read',
        plan: 'nhra',
        capabilities: new Set(['nhra.tech.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByText('Tech Master')).toBeInTheDocument();
    });

    it('shows Rules & Governance module card when user has rules.read', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'user' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: (cap: string) => cap === 'rules.read',
        plan: 'nhra',
        capabilities: new Set(['rules.read']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByText('Rules & Governance')).toBeInTheDocument();
    });

    it('shows Admin Portal for admin users', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        user: { displayName: 'Test User', roleId: 'admin' },
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(() => true),
        plan: 'nhra',
        capabilities: new Set(['nhra.parity']),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByText('Admin Portal')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated users', () => {
    it('shows Landing page for non-authenticated users', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        user: null,
        hasFeature: vi.fn(),
      } as any);

      vi.mocked(capabilitiesModule.useCapabilities).mockReturnValue({
        can: vi.fn(),
        plan: null,
        capabilities: new Set(),
      } as any);

      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      );

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });
  });
});
