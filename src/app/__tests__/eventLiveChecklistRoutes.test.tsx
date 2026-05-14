/**
 * Event Live Checklist — Route and UI Tests
 *
 * Covers:
 *   - /event-ops/:id/live requires eventops.read
 *   - read-only users see task status but no mutation controls
 *   - admin users see task mutation controls
 *   - empty live state renders without crashing
 *   - task statuses render correctly
 *   - follow-up and carry-forward flags render correctly
 *   - /event-ops/:id/live is in NHRA_ALLOWED_PREFIXES coverage
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventLiveChecklist from '../../pages/EventLiveChecklist';

// ── Capability mock helper ──────────────────────────────────────────────────

vi.mock('../../domain/config/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

vi.mock('../../domain/eventOps/eventOpsApi', () => ({
  getPlan: vi.fn(),
  getLiveChecklist: vi.fn(),
  listLiveSessionStatus: vi.fn(),
  listLiveTaskUpdates: vi.fn(),
  getLiveTaskSummary: vi.fn(),
  startLiveChecklist: vi.fn(),
  updateTaskStatus: vi.fn(),
  addTaskNote: vi.fn(),
  updateSessionStatus: vi.fn(),
  markTaskFollowupRequired: vi.fn(),
  markTaskCarryForward: vi.fn(),
  clearTaskFollowup: vi.fn(),
  clearTaskCarryForward: vi.fn(),
}));

import { useCapabilities } from '../../domain/config/useCapabilities';
import * as api from '../../domain/eventOps/eventOpsApi';

const mockUseCapabilities = useCapabilities as ReturnType<typeof vi.fn>;

const MOCK_PLAN = {
  id: 1, uuid: 'u1', year: 2026, event_code: 'NITRO-01', title: 'Nitro 2026',
  track_name: 'Pomona', class_scope: 'Nitro', plan_type: 'pre_event' as const, status: 'approved' as const,
  summary: null, created_by: 1, approved_by: null, approved_at: null,
  event_instance_id: null, parity_event_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_CHECKLIST = {
  id: 1, uuid: 'cl1', event_plan_id: 1, status: 'not_started' as const,
  active_session_id: null, started_at: null, completed_at: null, created_by: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_SUMMARY = {
  total: 2, by_status: {}, complete: 0, open: 2, in_progress: 0,
  issue_found: 0, followup_required: 1, carry_forward: 1,
};

const MOCK_TASK_WITH_FOLLOWUP = {
  id: 10, event_plan_id: 1, session_id: null, title: 'Fuel check', description: null,
  task_type: 'inspection' as const, priority: 'high' as const, status: 'open' as const,
  assigned_user_id: null, assigned_person_id: null, due_at: null, completed_at: null,
  completed_by: null, result_summary: null, sort_order: 1,
  carry_forward_to_next_event: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  live_update: {
    id: 1, uuid: 'u1', event_plan_id: 1, task_id: 10, session_id: null,
    status: 'issue_found' as const, result: null, notes: 'Check failed',
    issue_found: 1, followup_required: 1, carry_forward: 0,
    completed_by: null, completed_at: null, updated_by: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
};

const MOCK_TASK_WITH_CARRY = {
  id: 11, event_plan_id: 1, session_id: null, title: 'Wing check', description: null,
  task_type: 'inspection' as const, priority: 'normal' as const, status: 'open' as const,
  assigned_user_id: null, assigned_person_id: null, due_at: null, completed_at: null,
  completed_by: null, result_summary: null, sort_order: 2,
  carry_forward_to_next_event: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  live_update: {
    id: 2, uuid: 'u2', event_plan_id: 1, task_id: 11, session_id: null,
    status: 'not_started' as const, result: null, notes: null,
    issue_found: 0, followup_required: 0, carry_forward: 1,
    completed_by: null, completed_at: null, updated_by: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
};

function setupApiMocks(tasks = [MOCK_TASK_WITH_FOLLOWUP, MOCK_TASK_WITH_CARRY]) {
  vi.mocked(api.getPlan).mockResolvedValue({ plan: MOCK_PLAN });
  vi.mocked(api.getLiveChecklist).mockResolvedValue({ checklist: MOCK_CHECKLIST });
  vi.mocked(api.listLiveSessionStatus).mockResolvedValue({ sessions: [] });
  vi.mocked(api.listLiveTaskUpdates).mockResolvedValue({ tasks });
  vi.mocked(api.getLiveTaskSummary).mockResolvedValue({ summary: MOCK_SUMMARY });
}

function renderPage(isAdmin = false) {
  mockUseCapabilities.mockReturnValue({ can: (cap: string) => isAdmin ? true : cap === 'eventops.read' });
  return render(
    <MemoryRouter initialEntries={['/event-ops/1/live']}>
      <Routes>
        <Route path="/event-ops/:id/live" element={<EventLiveChecklist />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventLiveChecklist — route', () => {
  it('/event-ops is present in NHRA_ALLOWED_PREFIXES in App.tsx source', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain("'/event-ops'");
  });

  it('/event-ops/:id/live route is defined in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain('/event-ops/:id/live');
  });

  it('/event-ops/:id/live route requires eventops.read in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    const liveRouteBlock = src.slice(src.indexOf('/event-ops/:id/live'));
    expect(liveRouteBlock).toContain('eventops.read');
  });
});

describe('EventLiveChecklist — empty state', () => {
  it('renders empty state without crashing when no sessions or tasks', async () => {
    setupApiMocks([]);
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByTestId('live-checklist-empty')).toBeInTheDocument();
    });
  });
});

describe('EventLiveChecklist — read-only user', () => {
  it('shows plan header', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByText(/Nitro 2026|NITRO-01/i)).toBeInTheDocument();
    });
  });

  it('does not show Start Checklist button for read-only user', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.queryByTestId('start-checklist-btn')).not.toBeInTheDocument();
    });
  });

  it('does not show task status mutation buttons for read-only user', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.queryByTestId('task-status-complete')).not.toBeInTheDocument();
    });
  });
});

describe('EventLiveChecklist — admin user', () => {
  it('shows Start Checklist button when checklist is not_started', async () => {
    setupApiMocks();
    renderPage(true);
    await waitFor(() => {
      expect(screen.getByTestId('start-checklist-btn')).toBeInTheDocument();
    });
  });

  it('shows task status mutation buttons for admin', async () => {
    setupApiMocks();
    renderPage(true);
    await waitFor(() => {
      expect(screen.getAllByTestId('task-status-complete').length).toBeGreaterThan(0);
    });
  });

  it('shows follow-up button for admin', async () => {
    setupApiMocks();
    renderPage(true);
    await waitFor(() => {
      expect(screen.getAllByTestId('followup-btn').length).toBeGreaterThan(0);
    });
  });

  it('shows carry-forward button for admin', async () => {
    setupApiMocks();
    renderPage(true);
    await waitFor(() => {
      expect(screen.getAllByTestId('carry-forward-btn').length).toBeGreaterThan(0);
    });
  });
});

describe('EventLiveChecklist — task status rendering', () => {
  it('renders task cards', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getAllByTestId('task-card').length).toBe(2);
    });
  });

  it('renders issue_found status badge on task with issue', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByText(/Issue Found/i)).toBeInTheDocument();
    });
  });

  it('renders task notes', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByText(/Check failed/i)).toBeInTheDocument();
    });
  });
});

describe('EventLiveChecklist — follow-up and carry-forward flags', () => {
  it('renders follow-up flag on task with followup_required=1', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByTestId('followup-flag')).toBeInTheDocument();
    });
  });

  it('renders carry-forward flag on task with carry_forward=1', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      expect(screen.getByTestId('carry-forward-flag')).toBeInTheDocument();
    });
  });

  it('follow-ups tab shows flagged tasks', async () => {
    setupApiMocks();
    renderPage(false);
    await waitFor(() => {
      const tabBtn = screen.getByRole('button', { name: /Follow-ups/i });
      tabBtn.click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('followups-empty')).not.toBeInTheDocument();
    });
  });
});
