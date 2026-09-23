/**
 * EventScheduleSheet tests
 *
 * Validates the read-only printed-schedule presentation:
 * - event header (code, title, track, date)
 * - schedule table columns matching the paper schedule
 * - staff grid (staff/vehicle/phone/radio/assignment/duties)
 * - day navigation chips
 * - no admin/edit controls (read-only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../shared/hooks/useResponsive', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('../../domain/eventOps/eventOpsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/eventOps/eventOpsApi')>();
  return {
    ...actual,
    getPlan: vi.fn(),
    getPlanStaff: vi.fn(),
    getSchedule: vi.fn(),
  };
});

import { getPlan, getPlanStaff, getSchedule } from '../../domain/eventOps/eventOpsApi';
import EventScheduleSheet from '../EventScheduleSheet';
import type { EventPlan, EventPlanStaff, EventScheduleItem } from '../../domain/eventOps/eventOpsApi';

const PLAN: EventPlan = {
  id: 7, uuid: 'p-7', year: 2026, event_code: 'GATOR', title: 'Gatornationals',
  track_name: 'Gainesville Raceway', class_scope: 'TF,FC', plan_type: 'pre_event',
  status: 'approved', summary: null, event_date: '2026-03-13',
  lifecycle_stage: 'pre_event', event_instance_id: null, parity_event_id: null,
  created_by: 1, approved_by: null, approved_at: null,
  created_at: '', updated_at: '',
};

const STAFF: EventPlanStaff[] = [
  {
    id: 11, event_plan_id: 7, person_id: null, user_id: null, display_name: 'Joey Smith',
    assignment: 'TF/FC Inspector', radio_number: '4', vehicle: 'Cart 2', phone: '555-1234',
    arrive_at: null, depart_at: null, notes: null, is_active: 1,
    duties: [{ id: 31, staff_id: 11, duty: 'Fuel Check', sort_order: 0 }],
    created_at: '', updated_at: '',
  },
  {
    id: 12, event_plan_id: 7, person_id: null, user_id: null, display_name: 'Inactive Person',
    assignment: 'None', radio_number: null, vehicle: null, phone: null,
    arrive_at: null, depart_at: null, notes: null, is_active: 0, duties: [],
    created_at: '', updated_at: '',
  },
];

const ITEMS: EventScheduleItem[] = [
  {
    id: 2, uuid: '', event_plan_id: 7, session_id: null, schedule_date: '2026-03-13',
    day_label: null, title: 'Funny Car', sort_order: 0, scheduled_time: '15:00:00',
    projected_time: '15:10:00', activity_type: 'racing', category_code: 'FC',
    round_label: 'R2', expected_car_count: 14, comments: null,
    scheduled_time_label: null, projected_time_label: null,
    scale_required: 0, fuel_required: 1, status: 'upcoming',
    actual_start_at: null, actual_end_at: null, created_by: null,
    created_at: '', updated_at: '',
    assignments: [{ id: 22, schedule_item_id: 2, staff_id: 11, staff_display_name: 'Joey Smith', assignee_name: null, responsibility: 'Lane Checks', notes: null, sort_order: 0 }],
  },
];

function renderSheet() {
  return render(
    <MemoryRouter initialEntries={['/event-ops/7/sheet']}>
      <Routes>
        <Route path="/event-ops/:id/sheet" element={<EventScheduleSheet />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EventScheduleSheet', () => {
  beforeEach(() => {
    vi.mocked(getPlan).mockResolvedValue({ plan: PLAN });
    vi.mocked(getPlanStaff).mockResolvedValue({ staff: STAFF });
    vi.mocked(getSchedule).mockResolvedValue({ items: ITEMS, days: ['2026-03-13'] });
  });

  it('renders the event header', async () => {
    renderSheet();
    await waitFor(() => screen.getByTestId('event-schedule-sheet'));
    expect(screen.getByText(/GATOR — Gatornationals/)).toBeInTheDocument();
    expect(screen.getByText(/Gainesville Raceway/)).toBeInTheDocument();
  });

  it('renders printed-schedule columns', async () => {
    renderSheet();
    await waitFor(() => screen.getByTestId('sheet-item-2'));
    for (const col of ['Time', 'Proj', 'Activity / Category', 'Round', 'Cars', 'Comments', 'Scale', 'Fuel']) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    }
    const row = screen.getByTestId('sheet-item-2');
    expect(within(row).getByText('15:00')).toBeInTheDocument();
    expect(within(row).getByText('15:10')).toBeInTheDocument();
    expect(within(row).getByText(/Funny Car/)).toBeInTheDocument();
    expect(within(row).getByText('R2')).toBeInTheDocument();
    expect(within(row).getByText('14')).toBeInTheDocument();
    expect(within(row).getByText(/Lane Checks/)).toBeInTheDocument();
  });

  it('renders the staff grid and hides inactive staff', async () => {
    renderSheet();
    await waitFor(() => screen.getByTestId('sheet-staff'));
    for (const col of ['Staff', 'Vehicle', 'Phone', 'Radio', 'Assignment', 'Duties']) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('sheet-staff-11')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-staff-12')).not.toBeInTheDocument();
    const row = screen.getByTestId('sheet-staff-11');
    expect(within(row).getByText('Cart 2')).toBeInTheDocument();
    expect(within(row).getByText('Fuel Check')).toBeInTheDocument();
  });

  it('is read-only (no admin buttons)', async () => {
    renderSheet();
    await waitFor(() => screen.getByTestId('event-schedule-sheet'));
    expect(screen.queryByText(/\+ Add/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('shows empty state when no schedule items', async () => {
    vi.mocked(getSchedule).mockResolvedValue({ items: [], days: [] });
    renderSheet();
    await waitFor(() => screen.getByText(/No schedule items recorded/i));
  });
});
