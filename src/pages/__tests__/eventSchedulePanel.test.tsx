/**
 * EventSchedulePanel tests
 *
 * Validates:
 * - day-grouped rendering of structured schedule items
 * - printed-schedule columns (time/projected/activity/round/cars/scale/fuel)
 * - scale/fuel flags render only when set (mobile) / always as flags (desktop)
 * - assignment summaries render (staff → responsibility)
 * - admin controls gated behind canAdmin
 * - mobile card layout vs desktop table
 * - add/edit/delete/duplicate/reorder wiring calls the right API functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../shared/hooks/useResponsive', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('../../domain/eventOps/eventOpsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/eventOps/eventOpsApi')>();
  return {
    ...actual,
    getSchedule: vi.fn(),
    addScheduleItem: vi.fn(),
    updateScheduleItem: vi.fn(),
    deleteScheduleItem: vi.fn(),
    duplicateScheduleItem: vi.fn(),
    reorderScheduleItems: vi.fn(),
    setScheduleItemStatus: vi.fn(),
    addScheduleAssignment: vi.fn(),
    deleteScheduleAssignment: vi.fn(),
  };
});

import { useIsMobile } from '../../shared/hooks/useResponsive';
import {
  getSchedule, addScheduleItem, deleteScheduleItem, addScheduleAssignment,
  duplicateScheduleItem, reorderScheduleItems, setScheduleItemStatus,
} from '../../domain/eventOps/eventOpsApi';
import EventSchedulePanel from '../eventops/EventSchedulePanel';
import type { EventPlan, EventScheduleItem, EventPlanStaff } from '../../domain/eventOps/eventOpsApi';

const mockIsMobile = useIsMobile as ReturnType<typeof vi.fn>;
const mockGetSchedule = getSchedule as ReturnType<typeof vi.fn>;

const PLAN: EventPlan = {
  id: 7, uuid: 'p-7', year: 2026, event_code: 'GATOR', title: 'Gatornationals',
  track_name: 'Gainesville Raceway', class_scope: null, plan_type: 'pre_event',
  status: 'approved', summary: null, event_date: '2026-03-13',
  lifecycle_stage: 'pre_event', event_instance_id: null, parity_event_id: null,
  created_by: 1, approved_by: null, approved_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const STAFF: EventPlanStaff[] = [
  {
    id: 11, event_plan_id: 7, person_id: null, user_id: null, display_name: 'Joey',
    assignment: 'Inspector', radio_number: '4', vehicle: 'Cart 2', phone: null,
    arrive_at: null, depart_at: null, notes: null, is_active: 1, duties: [],
    created_at: '', updated_at: '',
  },
];

function item(over: Partial<EventScheduleItem>): EventScheduleItem {
  return {
    id: 1, uuid: '', event_plan_id: 7, session_id: null, schedule_date: '2026-03-13',
    day_label: null, title: 'Tech Team Meeting', sort_order: 0,
    scheduled_time: '07:30:00', scheduled_time_label: null,
    projected_time: null, projected_time_label: null, activity_type: 'meeting',
    category_code: null, round_label: null, expected_car_count: null,
    comments: null, scale_required: 0, fuel_required: 0, status: 'upcoming',
    actual_start_at: null, actual_end_at: null, created_by: null,
    created_at: '', updated_at: '', assignments: [],
    ...over,
  };
}

const ITEMS: EventScheduleItem[] = [
  item({ id: 1, title: 'Tech Team Meeting', scheduled_time: '07:30:00' }),
  item({
    id: 2, title: 'Top Fuel', category_code: 'TF', round_label: 'Q1',
    scheduled_time: '14:00:00', projected_time: '14:15:00', activity_type: 'racing',
    expected_car_count: 16, scale_required: 1, fuel_required: 1, sort_order: 1,
    comments: 'Lane choice by qualifying',
    assignments: [{ id: 21, schedule_item_id: 2, staff_id: 11, staff_display_name: 'Joey', assignee_name: null, responsibility: 'Lane Checks', notes: null, sort_order: 0 }],
  }),
  item({ id: 3, title: 'Teardown', schedule_date: '2026-03-15', scheduled_time: '18:00:00', activity_type: 'teardown', sort_order: 0 }),
  item({ id: 4, title: 'Contingency', schedule_date: '2026-03-15', scheduled_time: null, scheduled_time_label: 'Following TF Final', sort_order: 1 }),
];

function renderPanel(canAdmin = false) {
  return render(
    <MemoryRouter>
      <EventSchedulePanel planId={7} plan={PLAN} staff={STAFF} sessions={[]} canAdmin={canAdmin} />
    </MemoryRouter>,
  );
}

describe('EventSchedulePanel — desktop rendering', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockGetSchedule.mockResolvedValue({ items: ITEMS, days: ['2026-03-13', '2026-03-15'] });
  });

  it('renders day-grouped schedule with printed-schedule columns', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('event-schedule-panel'));
    expect(screen.getByTestId('schedule-day-2026-03-13')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-day-2026-03-15')).toBeInTheDocument();
    for (const col of ['Time', 'Projected', 'Activity / Category', 'Round', 'Cars', 'Comments', 'Scale', 'Fuel']) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    }
  });

  it('renders item fields: times, category, round, car count, comments', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('schedule-item-2'));
    const row = screen.getByTestId('schedule-item-2');
    expect(within(row).getByText('14:00')).toBeInTheDocument();
    expect(within(row).getByText('14:15')).toBeInTheDocument();
    expect(within(row).getByText('Top Fuel')).toBeInTheDocument();
    expect(within(row).getByText('TF')).toBeInTheDocument();
    expect(within(row).getByText('Q1')).toBeInTheDocument();
    expect(within(row).getByText('16')).toBeInTheDocument();
    expect(within(row).getByText('Lane choice by qualifying')).toBeInTheDocument();
  });

  it('renders label phrasing for non-clock times and trims HH:MM:SS', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('schedule-item-4'));
    expect(within(screen.getByTestId('schedule-item-4')).getByText('Following TF Final')).toBeInTheDocument();
    expect(within(screen.getByTestId('schedule-item-1')).getByText('07:30')).toBeInTheDocument();
  });

  it('renders schedule-specific assignment summary (staff → responsibility)', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('schedule-item-2'));
    expect(screen.getByText(/Joey → Lane Checks/)).toBeInTheDocument();
  });

  it('hides admin controls for read-only users', async () => {
    renderPanel(false);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    expect(screen.queryByTestId('add-schedule-item')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    // status select present but disabled
    const sel = screen.getAllByLabelText('status')[0] as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
  });

  it('admin sees add button and per-item controls', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    expect(screen.getByTestId('add-schedule-item')).toBeInTheDocument();
    expect(screen.getAllByTitle('Delete').length).toBe(4);
    expect(screen.getAllByTitle('Duplicate').length).toBe(4);
  });

  it('empty state renders when no items', async () => {
    mockGetSchedule.mockResolvedValue({ items: [], days: [] });
    renderPanel(true);
    await waitFor(() => screen.getByText(/No structured schedule items yet/i));
  });

  it('day filter chip narrows visible days', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('schedule-day-2026-03-13'));
    fireEvent.click(screen.getByRole('button', { name: 'Sun, Mar 15' }));
    await waitFor(() => {
      expect(screen.queryByTestId('schedule-day-2026-03-13')).not.toBeInTheDocument();
      expect(screen.getByTestId('schedule-day-2026-03-15')).toBeInTheDocument();
    });
  });
});

describe('EventSchedulePanel — admin actions', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockGetSchedule.mockResolvedValue({ items: ITEMS, days: ['2026-03-13', '2026-03-15'] });
    vi.mocked(deleteScheduleItem).mockResolvedValue({ success: true });
    vi.mocked(duplicateScheduleItem).mockResolvedValue({ success: true, item_id: 99 });
    vi.mocked(reorderScheduleItems).mockResolvedValue({ success: true });
    vi.mocked(setScheduleItemStatus).mockResolvedValue({ success: true });
    vi.mocked(addScheduleItem).mockResolvedValue({ success: true, item_id: 50 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('delete calls deleteScheduleItem after confirm', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    const row = screen.getByTestId('schedule-item-1');
    fireEvent.click(within(row).getByTitle('Delete'));
    await waitFor(() => expect(deleteScheduleItem).toHaveBeenCalledWith(1));
  });

  it('duplicate calls duplicateScheduleItem', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    fireEvent.click(within(screen.getByTestId('schedule-item-1')).getByTitle('Duplicate'));
    await waitFor(() => expect(duplicateScheduleItem).toHaveBeenCalledWith(1));
  });

  it('move down calls reorderScheduleItems with swapped ids', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    fireEvent.click(within(screen.getByTestId('schedule-item-1')).getByTitle('Move down'));
    await waitFor(() => expect(reorderScheduleItems).toHaveBeenCalledWith(7, [2, 1]));
  });

  it('status select calls setScheduleItemStatus', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    const sel = within(screen.getByTestId('schedule-item-1')).getByLabelText('status');
    fireEvent.change(sel, { target: { value: 'complete' } });
    await waitFor(() => expect(setScheduleItemStatus).toHaveBeenCalledWith(1, 'complete'));
  });

  it('add item opens modal and submits addScheduleItem', async () => {
    renderPanel(true);
    await waitFor(() => screen.getByTestId('add-schedule-item'));
    fireEvent.click(screen.getByTestId('add-schedule-item'));
    const modal = await screen.findByTestId('schedule-item-modal');
    fireEvent.change(within(modal).getByPlaceholderText(/Tech Team Meeting/i), { target: { value: 'Funny Car' } });
    fireEvent.click(within(modal).getByTestId('schedule-item-save'));
    await waitFor(() => expect(addScheduleItem).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Funny Car', activity_type: 'other' })));
  });

  it('assignee selector defaults to existing staff and passes staff_id', async () => {
    vi.mocked(addScheduleAssignment).mockResolvedValue({ success: true, assignment_id: 31 });
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    fireEvent.click(within(screen.getByTestId('schedule-item-1')).getByTitle('Edit'));
    const modal = await screen.findByTestId('schedule-item-modal');
    fireEvent.click(within(modal).getByText('+ Add assignment'));
    // staff select is the primary control — free-text is an explicit fallback option
    const sel = within(modal).getByLabelText('assignee') as HTMLSelectElement;
    expect(sel.value).toBe('');
    fireEvent.change(sel, { target: { value: '11' } });
    fireEvent.change(within(modal).getByPlaceholderText('Responsibility'), { target: { value: 'Lane Checks' } });
    // no free-text name input shown for a staff pick
    expect(within(modal).queryByPlaceholderText(/non-staff assignee/i)).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByTestId('schedule-item-save'));
    await waitFor(() => expect(addScheduleAssignment).toHaveBeenCalledWith(1,
      expect.objectContaining({ staff_id: 11, responsibility: 'Lane Checks' })));
    expect(vi.mocked(addScheduleAssignment).mock.calls[0][1].assignee_name).toBeUndefined();
  });

  it('assignee free-text is an explicit fallback via "not on staff list" option', async () => {
    vi.mocked(addScheduleAssignment).mockResolvedValue({ success: true, assignment_id: 32 });
    renderPanel(true);
    await waitFor(() => screen.getByTestId('schedule-item-1'));
    fireEvent.click(within(screen.getByTestId('schedule-item-1')).getByTitle('Edit'));
    const modal = await screen.findByTestId('schedule-item-modal');
    fireEvent.click(within(modal).getByText('+ Add assignment'));
    const sel = within(modal).getByLabelText('assignee');
    fireEvent.change(sel, { target: { value: '__other__' } });
    const nameInput = await within(modal).findByPlaceholderText(/non-staff assignee/i);
    fireEvent.change(nameInput, { target: { value: 'Volunteer Crew' } });
    fireEvent.change(within(modal).getByPlaceholderText('Responsibility'), { target: { value: 'Trash run' } });
    fireEvent.click(within(modal).getByTestId('schedule-item-save'));
    await waitFor(() => expect(addScheduleAssignment).toHaveBeenCalledWith(1,
      expect.objectContaining({ staff_id: null, assignee_name: 'Volunteer Crew', responsibility: 'Trash run' })));
  });
});

describe('EventSchedulePanel — mobile rendering', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(true);
    mockGetSchedule.mockResolvedValue({ items: ITEMS, days: ['2026-03-13', '2026-03-15'] });
  });

  it('renders cards instead of table on mobile', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('schedule-item-2'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // card still shows key info
    const card = screen.getByTestId('schedule-item-2');
    expect(within(card).getByText('Top Fuel')).toBeInTheDocument();
    expect(within(card).getByText('SCALE')).toBeInTheDocument();
    expect(within(card).getByText('FUEL')).toBeInTheDocument();
    expect(within(card).getByText(/16 cars/)).toBeInTheDocument();
  });
});
