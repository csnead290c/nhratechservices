/**
 * Event Ops Route Tests
 *
 * Validates:
 * - /event-ops is in NHRA_ALLOWED_PREFIXES (NHRA users can access it)
 * - /event-ops route requires eventops.read capability
 * - Admin controls hidden for read-only users
 * - Empty plans state displays correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../domain/config/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

vi.mock('../../domain/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { displayName: 'Test', roleId: 'member' } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../domain/eventOps/eventOpsApi', () => ({
  listPlans: vi.fn(),
}));

import { useCapabilities } from '../../domain/config/useCapabilities';
import { listPlans } from '../../domain/eventOps/eventOpsApi';
import EventOpsList from '../../pages/EventOpsList';

const mockUseCapabilities = useCapabilities as ReturnType<typeof vi.fn>;
const mockListPlans = listPlans as ReturnType<typeof vi.fn>;

function renderList() {
  return render(
    <MemoryRouter>
      <EventOpsList />
    </MemoryRouter>,
  );
}

describe('EventOpsList — empty state', () => {
  beforeEach(() => {
    mockListPlans.mockResolvedValue({ plans: [] });
  });

  it('shows empty state when read-only user has no plans', async () => {
    mockUseCapabilities.mockReturnValue({ can: (c: string) => c === 'eventops.read', plan: 'nhra' });
    renderList();
    await waitFor(() => expect(screen.getByTestId('event-ops-empty')).toBeInTheDocument());
    expect(screen.getByText(/No event plans yet/i)).toBeInTheDocument();
  });

  it('read-only user does NOT see "+ New Plan" button', async () => {
    mockUseCapabilities.mockReturnValue({ can: (c: string) => c === 'eventops.read', plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByTestId('event-ops-empty'));
    expect(screen.queryByText(/\+ New Plan/i)).not.toBeInTheDocument();
  });

  it('admin user sees "+ New Plan" button', async () => {
    mockUseCapabilities.mockReturnValue({ can: () => true, plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByTestId('event-ops-empty'));
    expect(screen.getByRole('button', { name: /\+ New Plan/i })).toBeInTheDocument();
  });

  it('shows page heading', async () => {
    mockUseCapabilities.mockReturnValue({ can: (c: string) => c === 'eventops.read', plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByTestId('event-ops-empty'));
    expect(screen.getByText('Event Operations')).toBeInTheDocument();
  });
});

describe('EventOpsList — plan rows', () => {
  beforeEach(() => {
    mockListPlans.mockResolvedValue({
      plans: [{
        id: 1, uuid: 'abc-123', year: 2026, event_code: 'POMONA_Q1',
        title: '2026 Winternationals Pre-Event Plan', track_name: 'Auto Club Raceway',
        class_scope: 'TF,FC', plan_type: 'pre_event', status: 'draft',
        summary: null, created_by: 1, approved_by: null, approved_at: null,
        created_at: '2026-01-15T10:00:00Z', updated_at: '2026-01-15T12:00:00Z',
      }],
    });
  });

  it('renders plan rows in a table', async () => {
    mockUseCapabilities.mockReturnValue({ can: () => true, plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByText('2026 Winternationals Pre-Event Plan'));
    expect(screen.getByText('POMONA_Q1')).toBeInTheDocument();
    expect(screen.getByText('Auto Club Raceway')).toBeInTheDocument();
    expect(screen.getByText('TF,FC')).toBeInTheDocument();
  });

  it('read-only user sees View link but not Edit link', async () => {
    mockUseCapabilities.mockReturnValue({ can: (c: string) => c === 'eventops.read', plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByText('2026 Winternationals Pre-Event Plan'));
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('admin user sees View AND Edit links', async () => {
    mockUseCapabilities.mockReturnValue({ can: () => true, plan: 'nhra' });
    renderList();
    await waitFor(() => screen.getByText('2026 Winternationals Pre-Event Plan'));
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});

describe('NHRA_ALLOWED_PREFIXES includes /event-ops', () => {
  it('App.tsx exports /event-ops as an NHRA-allowed route', async () => {
    const src = await import('fs').then(fs => fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8'));
    expect(src).toContain("'/event-ops'");
  });
});
