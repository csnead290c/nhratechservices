/**
 * Event Operations Capability Tests
 *
 * Validates that eventops.read/admin capabilities are correctly assigned
 * across plans and roles, in sync with capabilities.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  hasCap, PLAN_CAPABILITIES, ROLE_CAPABILITIES,
  type UserCapabilityContext,
} from '../../config/capabilities';

describe('eventops capabilities — plan grants', () => {
  it('nhra plan includes eventops.read', () => {
    expect(PLAN_CAPABILITIES.nhra.has('eventops.read')).toBe(true);
  });

  it('nhra plan does NOT include eventops.admin', () => {
    expect(PLAN_CAPABILITIES.nhra.has('eventops.admin')).toBe(false);
  });

  it('free plan does not include eventops.read', () => {
    expect(PLAN_CAPABILITIES.free.has('eventops.read')).toBe(false);
  });

  it('basic plan does not include eventops.read', () => {
    expect(PLAN_CAPABILITIES.basic.has('eventops.read')).toBe(false);
  });

  it('pro plan does not include eventops.read', () => {
    expect(PLAN_CAPABILITIES.pro.has('eventops.read')).toBe(false);
  });

  it('team plan does not include eventops.read', () => {
    expect(PLAN_CAPABILITIES.team.has('eventops.read')).toBe(false);
  });
});

describe('eventops capabilities — role grants', () => {
  it('owner role includes eventops.read', () => {
    expect(ROLE_CAPABILITIES.owner.has('eventops.read')).toBe(true);
  });

  it('owner role includes eventops.admin', () => {
    expect(ROLE_CAPABILITIES.owner.has('eventops.admin')).toBe(true);
  });

  it('admin role includes eventops.read', () => {
    expect(ROLE_CAPABILITIES.admin.has('eventops.read')).toBe(true);
  });

  it('admin role includes eventops.admin', () => {
    expect(ROLE_CAPABILITIES.admin.has('eventops.admin')).toBe(true);
  });

  it('member role does NOT include eventops.read', () => {
    expect(ROLE_CAPABILITIES.member.has('eventops.read')).toBe(false);
  });

  it('viewer role does NOT include eventops.admin', () => {
    expect(ROLE_CAPABILITIES.viewer.has('eventops.admin')).toBe(false);
  });
});

describe('eventops hasCap — combined contexts', () => {
  it('nhra plan member can read event ops', () => {
    const ctx: UserCapabilityContext = { plan: 'nhra', role: 'member', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(true);
  });

  it('nhra plan member CANNOT admin event ops', () => {
    const ctx: UserCapabilityContext = { plan: 'nhra', role: 'member', fullAccess: false };
    expect(hasCap(ctx, 'eventops.admin')).toBe(false);
  });

  it('owner (any plan) can read and admin event ops', () => {
    const ctx: UserCapabilityContext = { plan: 'free', role: 'owner', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(true);
    expect(hasCap(ctx, 'eventops.admin')).toBe(true);
  });

  it('admin (any plan) can read and admin event ops', () => {
    const ctx: UserCapabilityContext = { plan: 'free', role: 'admin', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(true);
    expect(hasCap(ctx, 'eventops.admin')).toBe(true);
  });

  it('fullAccess context can access eventops', () => {
    const ctx: UserCapabilityContext = { plan: 'free', role: 'member', fullAccess: true };
    expect(hasCap(ctx, 'eventops.read')).toBe(true);
    expect(hasCap(ctx, 'eventops.admin')).toBe(true);
  });

  it('free user (no role elevation) CANNOT access event ops', () => {
    const ctx: UserCapabilityContext = { plan: 'free', role: 'member', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(false);
    expect(hasCap(ctx, 'eventops.admin')).toBe(false);
  });

  it('pro user CANNOT access event ops (no nhra plan, no role)', () => {
    const ctx: UserCapabilityContext = { plan: 'pro', role: 'member', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(false);
    expect(hasCap(ctx, 'eventops.admin')).toBe(false);
  });

  it('nhra plan admin can read AND admin event ops (plan+role combined)', () => {
    const ctx: UserCapabilityContext = { plan: 'nhra', role: 'admin', fullAccess: false };
    expect(hasCap(ctx, 'eventops.read')).toBe(true);
    expect(hasCap(ctx, 'eventops.admin')).toBe(true);
  });
});
