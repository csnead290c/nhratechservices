/**
 * Rules Committees API Service Tests
 *
 * Tests for committeesApi.ts service functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCommittees,
  fetchCommittee,
  fetchCommitteeMembers,
  fetchCommitteeCategories,
  createCommittee,
  updateCommittee,
  deleteCommittee,
  addCommitteeMember,
  updateCommitteeMember,
  removeCommitteeMember,
  fetchEligibleUsers,
} from '../committeesApi';

describe('committeesApi', () => {
  beforeEach(() => {
    localStorage.setItem('rsa_token', 'test-token');
  });

  afterEach(() => {
    localStorage.removeItem('rsa_token');
    vi.restoreAllMocks();
  });

  // ─── Read Endpoints ─────────────────────────────────────────────────────

  describe('fetchCommittees', () => {
    it('returns empty list when API returns empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ committees: [], count: 0 }),
      } as Response);

      const result = await fetchCommittees();
      expect(result.committees).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('sends status filter when provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ committees: [], count: 0 }),
      } as Response);
      global.fetch = fetchMock;

      await fetchCommittees({ status: 'active' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=list&status=active'),
        expect.any(Object)
      );
    });

    it('sends category filter when provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ committees: [], count: 0 }),
      } as Response);
      global.fetch = fetchMock;

      await fetchCommittees({ category: 'Safety' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=list&category=Safety'),
        expect.any(Object)
      );
    });

    it('throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Missing capability' }),
      } as Response);

      await expect(fetchCommittees()).rejects.toThrow('Missing capability');
    });
  });

  describe('fetchCommittee', () => {
    it('fetches committee by id', async () => {
      const mockCommittee = {
        committee: { id: 1, name: 'Safety Committee' },
        members: [],
        chair: null,
        co_chair: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCommittee),
      } as Response);

      const result = await fetchCommittee('1');
      expect(result.committee.id).toBe(1);
    });

    it('fetches committee by slug', async () => {
      const mockCommittee = {
        committee: { id: 1, slug: 'safety-committee', name: 'Safety Committee' },
        members: [],
        chair: null,
        co_chair: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCommittee),
      } as Response);

      const result = await fetchCommittee('safety-committee');
      expect(result.committee.slug).toBe('safety-committee');
    });
  });

  describe('fetchCommitteeMembers', () => {
    it('returns members for committee', async () => {
      const mockResponse = {
        members: [{ id: 1, user_name: 'John Doe', role: 'chairman' }],
        count: 1,
        chair: { id: 1, role: 'chairman' },
        co_chair: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await fetchCommitteeMembers(1);
      expect(result.members).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  describe('fetchCommitteeCategories', () => {
    it('returns category list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ categories: ['Safety', 'Technical'] }),
      } as Response);

      const result = await fetchCommitteeCategories();
      expect(result.categories).toEqual(['Safety', 'Technical']);
    });
  });

  // ─── Admin Endpoints ────────────────────────────────────────────────────

  describe('createCommittee', () => {
    it('creates committee with name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 1, uuid: 'test-uuid' }),
      } as Response);

      const result = await createCommittee({ name: 'New Committee' });
      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
    });

    it('sends all fields to API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 1, uuid: 'uuid' }),
      } as Response);
      global.fetch = fetchMock;

      await createCommittee({
        name: 'Test Committee',
        slug: 'test-committee',
        description: 'A test committee',
        category: 'Technical',
        class_scope: 'Top Fuel',
        status: 'active',
      });

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.name).toBe('Test Committee');
      expect(body.slug).toBe('test-committee');
      expect(body.category).toBe('Technical');
    });
  });

  describe('updateCommittee', () => {
    it('updates committee fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const result = await updateCommittee(1, { name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('sends PUT request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
      global.fetch = fetchMock;

      await updateCommittee(1, { status: 'inactive' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=update'),
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('deleteCommittee', () => {
    it('sends DELETE request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
      global.fetch = fetchMock;

      await deleteCommittee(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=delete'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('addCommitteeMember', () => {
    it('adds member with required fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 1 }),
      } as Response);

      const result = await addCommitteeMember({
        committee_id: 1,
        user_id: 2,
        role: 'member',
      });
      expect(result.success).toBe(true);
    });

    it('sends POST with member data', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 1 }),
      } as Response);
      global.fetch = fetchMock;

      await addCommitteeMember({
        committee_id: 1,
        user_id: 2,
        person_id: 3,
        role: 'chairman',
        title: 'Chair',
        voting_member: 1,
        start_date: '2026-01-01',
      });

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.committee_id).toBe(1);
      expect(body.role).toBe('chairman');
      expect(body.voting_member).toBe(1);
    });
  });

  describe('updateCommitteeMember', () => {
    it('updates member role', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const result = await updateCommitteeMember(1, { role: 'co_chairman' });
      expect(result.success).toBe(true);
    });
  });

  describe('removeCommitteeMember', () => {
    it('sends DELETE request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
      global.fetch = fetchMock;

      await removeCommitteeMember(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=removeMember'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('fetchEligibleUsers', () => {
    it('returns eligible users list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          users: [{ id: 1, name: 'John Doe', email: 'john@example.com' }],
          count: 1,
        }),
      } as Response);

      const result = await fetchEligibleUsers(1);
      expect(result.users).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  // ─── Error Handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws on 401 unauthorized', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Authentication required' }),
      } as Response);

      await expect(fetchCommittees()).rejects.toThrow('Authentication required');
    });

    it('throws on 403 forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Missing capability: committees.admin' }),
      } as Response);

      await expect(createCommittee({ name: 'Test' })).rejects.toThrow('Missing capability');
    });

    it('throws on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(fetchCommittees()).rejects.toThrow('Network error');
    });
  });
});
