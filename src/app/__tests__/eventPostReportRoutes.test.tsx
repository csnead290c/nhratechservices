/**
 * Event Post-Event Report Routes + UI Tests
 *
 * Tests:
 *   - /event-ops/:id/post-report route is in App.tsx
 *   - /event-ops/reports/:reportId route is in App.tsx
 *   - both routes require eventops.read
 *   - EventPostReportBuilder: empty state renders without crashing
 *   - EventPostReportBuilder: summary cards display counts
 *   - EventPostReportBuilder: admin sees Generate Report button
 *   - EventPostReportBuilder: read-only user does NOT see Generate Report button
 *   - EventPostReportBuilder: issue rows render correctly
 *   - EventPostReportBuilder: follow-up rows render correctly
 *   - EventPostReportDetail: renders sections
 *   - EventPostReportDetail: admin sees Finalize button
 *   - EventPostReportDetail: read-only user does NOT see Finalize button
 *   - EventPostReportDetail: admin sees PDF Export placeholder (disabled)
 *   - report item rows render with source_type
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventPostReportBuilder from '../../pages/EventPostReportBuilder';
import EventPostReportDetail  from '../../pages/EventPostReportDetail';

vi.mock('../../domain/config/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

vi.mock('../../domain/eventOps/eventOpsApi', () => ({
  getPlan:               vi.fn(),
  getPostReportPreview:  vi.fn(),
  listPostReports:       vi.fn(),
  generatePostReport:    vi.fn(),
  getPostReport:         vi.fn(),
  getPostReportSections: vi.fn(),
  getPostReportItems:    vi.fn(),
  getPostReportFiles:    vi.fn(),
  getPostReportIncidents:vi.fn(),
  finalizePostReport:    vi.fn(),
  reopenPostReport:      vi.fn(),
  regeneratePostReportSummary: vi.fn(),
  updateReportSection:   vi.fn(),
  addReportItem:         vi.fn(),
  deleteReportItem:      vi.fn(),
}));

import { useCapabilities } from '../../domain/config/useCapabilities';
import * as api from '../../domain/eventOps/eventOpsApi';

const mockUseCapabilities = useCapabilities as ReturnType<typeof vi.fn>;

// ── Mock data ────────────────────────────────────────────────────────────

const MOCK_PLAN = {
  id: 1, uuid: 'p1', year: 2026, event_code: 'NITRO-01', title: 'Nitro 2026',
  track_name: 'Pomona', class_scope: 'Nitro',
  plan_type: 'pre_event' as const, status: 'approved' as const,
  summary: 'Test event', created_by: 1, approved_by: null, approved_at: null,
  event_instance_id: null, parity_event_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_PREVIEW_COUNTS = {
  total_tasks: 10, completed_tasks: 7, open_tasks: 2,
  issue_tasks: 1, followup_tasks: 1, carry_forward_tasks: 1,
  file_count: 2, staff_count: 3,
};

const MOCK_ISSUE_TASK = {
  id: 10, event_plan_id: 1, session_id: null, title: 'Fuel check',
  description: null, task_type: 'inspection' as const, priority: 'high' as const,
  status: 'open' as const, assigned_user_id: null, assigned_person_id: null,
  due_at: null, completed_at: null, completed_by: null, result_summary: null,
  sort_order: 1, carry_forward_to_next_event: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  live_update: {
    id: 1, uuid: 'lu1', event_plan_id: 1, task_id: 10, session_id: null,
    status: 'issue_found' as const, result: null, notes: 'Check failed — overfill',
    issue_found: 1, followup_required: 0, carry_forward: 0,
    completed_by: null, completed_at: null, updated_by: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
};

const MOCK_FOLLOWUP_TASK = {
  id: 11, event_plan_id: 1, session_id: null, title: 'Wing inspection',
  description: null, task_type: 'inspection' as const, priority: 'normal' as const,
  status: 'open' as const, assigned_user_id: null, assigned_person_id: null,
  due_at: null, completed_at: null, completed_by: null, result_summary: null,
  sort_order: 2, carry_forward_to_next_event: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  live_update: {
    id: 2, uuid: 'lu2', event_plan_id: 1, task_id: 11, session_id: null,
    status: 'not_started' as const, result: null, notes: 'Pending part arrival',
    issue_found: 0, followup_required: 1, carry_forward: 1,
    completed_by: null, completed_at: null, updated_by: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
};

const MOCK_PREVIEW = {
  plan: MOCK_PLAN,
  staff: [{ id: 1, event_plan_id: 1, user_id: null, person_id: null, display_name: 'Joe', assignment: 'Inspector', arrive_at: null, depart_at: null, notes: null, sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  sessions: [],
  files: [],
  counts: MOCK_PREVIEW_COUNTS,
  issue_items: [MOCK_ISSUE_TASK],
  followup_items: [MOCK_FOLLOWUP_TASK],
  sections: [
    { section_key: 'event_summary', title: 'Event Summary', generated_body: 'NITRO-01 2026 — Pomona' },
    { section_key: 'issues_found',  title: 'Issues Found',  generated_body: '1 issue recorded.' },
  ],
};

const MOCK_REPORT = {
  id: 1, uuid: 'r1', event_plan_id: 1,
  title: 'Nitro 2026 — Post-Event Report',
  status: 'generated' as const,
  summary: null, generated_summary: null,
  completed_task_count: 7, open_task_count: 2, issue_task_count: 1,
  followup_task_count: 1, carry_forward_task_count: 1, incident_count: 0,
  generated_at: '2026-05-01T00:00:00Z', finalized_at: null, finalized_by: null,
  created_by: 1, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
};

const MOCK_SECTION: import('../../domain/eventOps/eventOpsApi').EventPostReportSection = {
  id: 1, report_id: 1, section_key: 'event_summary', title: 'Event Summary',
  body: null, generated_body: 'NITRO-01 2026 — Pomona', sort_order: 0,
  created_by: 1, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
};

// ── Render helpers ────────────────────────────────────────────────────────

function renderBuilder(planId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/event-ops/${planId}/post-report`]}>
      <Routes>
        <Route path="/event-ops/:id/post-report" element={<EventPostReportBuilder />} />
        <Route path="/event-ops/reports/:reportId" element={<div data-testid="report-detail" />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderDetail(reportId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/event-ops/reports/${reportId}`]}>
      <Routes>
        <Route path="/event-ops/reports/:reportId" element={<EventPostReportDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupBuilderMocks(isAdmin = false) {
  mockUseCapabilities.mockReturnValue({ can: (cap: string) => cap === 'eventops.read' || (isAdmin && cap === 'eventops.admin') });
  (api.getPlan as ReturnType<typeof vi.fn>).mockResolvedValue({ plan: MOCK_PLAN });
  (api.getPostReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({ preview: MOCK_PREVIEW });
  (api.listPostReports as ReturnType<typeof vi.fn>).mockResolvedValue({ reports: [] });
}

type RS = import('../../domain/eventOps/eventOpsApi').ReportStatus;
function setupDetailMocks(isAdmin = false, reportStatus: RS = 'generated') {
  mockUseCapabilities.mockReturnValue({ can: (cap: string) => cap === 'eventops.read' || (isAdmin && cap === 'eventops.admin') });
  (api.getPostReport as ReturnType<typeof vi.fn>).mockResolvedValue({ report: { ...MOCK_REPORT, status: reportStatus } });
  (api.getPostReportSections as ReturnType<typeof vi.fn>).mockResolvedValue({ sections: [MOCK_SECTION] });
  (api.getPostReportItems as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  (api.getPostReportFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ files: [] });
  (api.getPostReportIncidents as ReturnType<typeof vi.fn>).mockResolvedValue({ incidents: [] });
}

beforeEach(() => { vi.clearAllMocks(); });

// ── Route tests ───────────────────────────────────────────────────────────

describe('EventPostReportBuilder — routes', () => {
  it('/event-ops/:id/post-report route is defined in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain('/event-ops/:id/post-report');
  });

  it('/event-ops/reports/:reportId route is defined in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain('/event-ops/reports/:reportId');
  });

  it('/event-ops/:id/post-report route requires eventops.read', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    const block = src.slice(src.indexOf('/event-ops/:id/post-report'));
    expect(block).toContain('eventops.read');
  });

  it('/event-ops/reports/:reportId route requires eventops.read', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    const block = src.slice(src.indexOf('/event-ops/reports/:reportId'));
    expect(block).toContain('eventops.read');
  });

  it('EventPostReportBuilder is lazily imported in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain("import('../pages/EventPostReportBuilder')");
  });

  it('EventPostReportDetail is lazily imported in App.tsx', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/app/App.tsx', 'utf8');
    expect(src).toContain("import('../pages/EventPostReportDetail')");
  });
});

// ── Builder UI tests ──────────────────────────────────────────────────────

describe('EventPostReportBuilder — empty state', () => {
  it('renders no-report state when no reports exist', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('no-report-state')).toBeInTheDocument());
  });

  it('renders summary cards with counts', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('summary-cards')).toBeInTheDocument());
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders plan title in header', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getByText(/Post-Event Report.*NITRO-01.*2026/)).toBeInTheDocument());
  });
});

describe('EventPostReportBuilder — admin controls', () => {
  it('admin sees Generate Report button', async () => {
    setupBuilderMocks(true);
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('generate-report-btn')).toBeInTheDocument());
  });

  it('admin sees PDF Export placeholder (disabled)', async () => {
    setupBuilderMocks(true);
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('pdf-export-btn')).toBeDisabled());
  });

  it('read-only user does NOT see Generate Report button', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.queryByTestId('generate-report-btn')).not.toBeInTheDocument());
  });
});

describe('EventPostReportBuilder — issue and follow-up rows', () => {
  it('issue rows render with task title', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getAllByTestId('item-row').length).toBeGreaterThan(0));
    expect(screen.getByText('Fuel check')).toBeInTheDocument();
  });

  it('follow-up rows render with task title', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getAllByTestId('item-row').length).toBeGreaterThan(0));
    expect(screen.getByText('Wing inspection')).toBeInTheDocument();
  });

  it('issue notes are displayed', async () => {
    setupBuilderMocks(false);
    renderBuilder();
    await waitFor(() => expect(screen.getByText('Check failed — overfill')).toBeInTheDocument());
  });
});

// ── Detail UI tests ───────────────────────────────────────────────────────

describe('EventPostReportDetail — sections', () => {
  it('renders report sections', async () => {
    setupDetailMocks(false);
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('report-section')).toBeInTheDocument());
    expect(screen.getByText('Event Summary')).toBeInTheDocument();
  });

  it('shows report title in header', async () => {
    setupDetailMocks(false);
    renderDetail();
    await waitFor(() => expect(screen.getByText('Nitro 2026 — Post-Event Report')).toBeInTheDocument());
  });

  it('shows count summary bar', async () => {
    setupDetailMocks(false);
    renderDetail();
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
  });
});

describe('EventPostReportDetail — admin controls', () => {
  it('admin sees Finalize button when not finalized', async () => {
    setupDetailMocks(true, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('finalize-btn')).toBeInTheDocument());
  });

  it('admin sees Reopen button when finalized', async () => {
    setupDetailMocks(true, 'finalized');
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('reopen-btn')).toBeInTheDocument());
  });

  it('admin sees Regenerate button', async () => {
    setupDetailMocks(true, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('regenerate-btn')).toBeInTheDocument());
  });

  it('admin sees PDF Export placeholder (disabled)', async () => {
    setupDetailMocks(true, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('pdf-export-btn')).toBeDisabled());
  });

  it('read-only user does NOT see Finalize button', async () => {
    setupDetailMocks(false, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.queryByTestId('finalize-btn')).not.toBeInTheDocument());
  });

  it('read-only user does NOT see Regenerate button', async () => {
    setupDetailMocks(false, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.queryByTestId('regenerate-btn')).not.toBeInTheDocument());
  });

  it('admin sees Edit button on sections', async () => {
    setupDetailMocks(true, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('edit-section-btn')).toBeInTheDocument());
  });

  it('read-only user does NOT see Edit button on sections', async () => {
    setupDetailMocks(false, 'generated');
    renderDetail();
    await waitFor(() => expect(screen.queryByTestId('edit-section-btn')).not.toBeInTheDocument());
  });
});

// ── Link presence tests ───────────────────────────────────────────────────

describe('EventPlanDetail post-report link', () => {
  it('EventPlanDetail.tsx contains post-report-link testid', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/pages/EventPlanDetail.tsx', 'utf8');
    expect(src).toContain('post-report-link');
    expect(src).toContain('/post-report');
  });
});

describe('EventLiveChecklist post-report link', () => {
  it('EventLiveChecklist.tsx contains generate-post-event-report link', () => {
    const fs = require('fs');
    const src: string = fs.readFileSync('/Users/csnead/Documents/NHRATS/src/pages/EventLiveChecklist.tsx', 'utf8');
    expect(src).toContain('post-report-link');
    expect(src).toContain('/post-report');
  });
});
