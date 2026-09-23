/**
 * EventStaffPanel tests
 *
 * Validates:
 * - printed-schedule staff columns (name/assignment/radio/vehicle/phone/arr/dep/duties/notes)
 * - duty chips render from normalized duty rows
 * - admin add/edit/delete gated behind canAdmin
 * - mobile card layout
 * - add staff submits new fields (radio, vehicle, phone, arrive/depart)
 * - duty add/remove calls duty endpoints
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
    addStaff: vi.fn(),
    updateStaff: vi.fn(),
    deleteStaff: vi.fn(),
    addStaffDuty: vi.fn(),
    deleteStaffDuty: vi.fn(),
  };
});

import { useIsMobile } from '../../shared/hooks/useResponsive';
import { addStaff, deleteStaff, addStaffDuty, deleteStaffDuty } from '../../domain/eventOps/eventOpsApi';
import EventStaffPanel from '../eventops/EventStaffPanel';
import type { EventPlanStaff } from '../../domain/eventOps/eventOpsApi';

const mockIsMobile = useIsMobile as ReturnType<typeof vi.fn>;

const STAFF: EventPlanStaff[] = [
  {
    id: 11, event_plan_id: 7, person_id: null, user_id: null, display_name: 'Joey Smith',
    assignment: 'TF/FC Inspector', radio_number: '4', vehicle: 'Cart 2', phone: '555-1234',
    arrive_at: '2026-03-12 08:00:00', depart_at: '2026-03-16 18:00:00',
    notes: 'Lead lane checker', is_active: 1,
    duties: [
      { id: 31, staff_id: 11, duty: 'Fuel Check', sort_order: 0 },
      { id: 32, staff_id: 11, duty: 'Scales', sort_order: 1 },
    ],
    created_at: '', updated_at: '',
  },
  {
    id: 12, event_plan_id: 7, person_id: null, user_id: null, display_name: 'Rick Jones',
    assignment: 'Floater', radio_number: null, vehicle: null, phone: null,
    arrive_at: null, depart_at: null, notes: null, is_active: 0, duties: [],
    created_at: '', updated_at: '',
  },
];

function renderPanel(canAdmin = false, staff = STAFF) {
  return render(
    <MemoryRouter>
      <EventStaffPanel planId={7} staff={staff} canAdmin={canAdmin} onChanged={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('EventStaffPanel — desktop', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false));

  it('renders printed-schedule staff columns', () => {
    renderPanel();
    for (const col of ['Name', 'Assignment', 'Radio', 'Vehicle', 'Phone', 'Arrive', 'Depart', 'Duties', 'Notes']) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
  });

  it('renders staff fields including radio, vehicle, phone', () => {
    renderPanel();
    const row = screen.getByTestId('staff-row-11');
    expect(within(row).getByText('Joey Smith')).toBeInTheDocument();
    expect(within(row).getByText('TF/FC Inspector')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('Cart 2')).toBeInTheDocument();
    expect(within(row).getByText('555-1234')).toBeInTheDocument();
    expect(within(row).getByText('Lead lane checker')).toBeInTheDocument();
  });

  it('renders normalized duty chips', () => {
    renderPanel();
    const row = screen.getByTestId('staff-row-11');
    expect(within(row).getByText('Fuel Check')).toBeInTheDocument();
    expect(within(row).getByText('Scales')).toBeInTheDocument();
  });

  it('shows active/inactive counts', () => {
    renderPanel();
    expect(screen.getByText(/1 active · 1 inactive/)).toBeInTheDocument();
  });

  it('hides admin controls for read-only users', () => {
    renderPanel(false);
    expect(screen.queryByTestId('add-staff')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('empty state renders', () => {
    renderPanel(false, []);
    expect(screen.getByText(/No staff assigned yet/i)).toBeInTheDocument();
  });
});

describe('EventStaffPanel — admin actions', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    vi.mocked(addStaff).mockResolvedValue({ success: true, staff_id: 99 });
    vi.mocked(deleteStaff).mockResolvedValue({ success: true });
    vi.mocked(addStaffDuty).mockResolvedValue({ success: true, duty_id: 40 });
    vi.mocked(deleteStaffDuty).mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('add staff submits extended fields', async () => {
    renderPanel(true);
    fireEvent.click(screen.getByTestId('add-staff'));
    const modal = await screen.findByTestId('staff-modal');
    fireEvent.change(within(modal).getByPlaceholderText('Full name'), { target: { value: 'Russell' } });
    fireEvent.change(within(modal).getByPlaceholderText(/Chief Tech Inspector/i), { target: { value: 'Tech' } });
    fireEvent.change(within(modal).getByPlaceholderText('e.g. 12'), { target: { value: '9' } });
    fireEvent.change(within(modal).getByPlaceholderText('e.g. Cart 3'), { target: { value: 'Scooter 1' } });
    fireEvent.click(within(modal).getByTestId('staff-save'));
    await waitFor(() => expect(addStaff).toHaveBeenCalledWith(7, expect.objectContaining({
      display_name: 'Russell', assignment: 'Tech', radio_number: '9', vehicle: 'Scooter 1', is_active: 1,
    })));
  });

  it('delete calls deleteStaff after confirm', async () => {
    renderPanel(true);
    const row = screen.getByTestId('staff-row-11');
    fireEvent.click(within(row).getByText('×'));
    await waitFor(() => expect(deleteStaff).toHaveBeenCalledWith(11));
  });

  it('add duty calls addStaffDuty', async () => {
    renderPanel(true);
    const row = screen.getByTestId('staff-row-11');
    fireEvent.click(within(row).getByText('Edit'));
    const modal = await screen.findByTestId('staff-modal');
    fireEvent.change(within(modal).getByPlaceholderText(/Fuel Check, Scales/i), { target: { value: 'Shutoffs' } });
    fireEvent.click(within(modal).getByText('Add'));
    await waitFor(() => expect(addStaffDuty).toHaveBeenCalledWith(7, 11, 'Shutoffs'));
  });

  it('remove duty chip calls deleteStaffDuty', async () => {
    renderPanel(true);
    fireEvent.click(within(screen.getByTestId('staff-row-11')).getByText('Edit'));
    const modal = await screen.findByTestId('staff-modal');
    const fuelChip = within(modal).getByText('Fuel Check'); // the chip span itself
    fireEvent.click(within(fuelChip).getByText('×'));
    await waitFor(() => expect(deleteStaffDuty).toHaveBeenCalledWith(31));
  });
});

describe('EventStaffPanel — mobile', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(true));

  it('renders cards with key fields instead of table', () => {
    renderPanel();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByTestId('staff-row-11');
    expect(within(card).getByText('Joey Smith')).toBeInTheDocument();
    expect(within(card).getByText('Cart 2')).toBeInTheDocument();
    expect(within(card).getByText('Fuel Check')).toBeInTheDocument();
    expect(within(card).queryByText('INACTIVE')).not.toBeInTheDocument();
  });

  it('marks inactive staff on mobile cards', () => {
    renderPanel();
    expect(within(screen.getByTestId('staff-row-12')).getByText('INACTIVE')).toBeInTheDocument();
  });
});
