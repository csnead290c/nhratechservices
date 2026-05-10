/**
 * Tests for rules import validation utility
 *
 * Run: node scripts/rules/__tests__/validate-rules-import.test.mjs
 */

import { describe, it, expect } from 'vitest';
import { validateImport } from '../validate-rules-import.mjs';

describe('Rules Import Validation', () => {
  describe('valid sample import', () => {
    it('passes validation with all required fields', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body content',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('missing required fields', () => {
    it('fails when rule_number is missing', () => {
      const data = {
        rules: [{
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rule_number') && e.includes('Missing'))).toBe(true);
    });

    it('fails when title is empty', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: '   ',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('title') && e.includes('non-whitespace'))).toBe(true);
    });

    it('fails when body is empty', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: '',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('body') && e.includes('non-whitespace'))).toBe(true);
    });
  });

  describe('invalid date formats', () => {
    it('fails with invalid effective_from date', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: 'not-a-date',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('effective_from') && e.includes('date'))).toBe(true);
    });

    it('fails when effective_to is before effective_from', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-12-31',
          effective_to: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('effective_to') && e.includes('effective_from'))).toBe(true);
    });
  });

  describe('duplicate rule numbers', () => {
    it('fails with duplicate rule numbers', () => {
      const data = {
        rules: [
          {
            rule_number: 'GEN-1.1',
            category: 'General',
            title: 'First Rule',
            body: 'First body',
            status: 'active',
            effective_from: '2026-01-01',
            version_number: 1
          },
          {
            rule_number: 'GEN-1.1', // Duplicate
            category: 'General',
            title: 'Second Rule',
            body: 'Second body',
            status: 'active',
            effective_from: '2026-01-01',
            version_number: 1
          }
        ]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.duplicates).toContain('GEN-1.1');
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
  });

  describe('invalid status values', () => {
    it('fails with invalid status', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'invalid-status',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('status'))).toBe(true);
    });
  });

  describe('version number validation', () => {
    it('fails with version_number < 1', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 0
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version_number') && e.includes('positive'))).toBe(true);
    });

    it('fails with non-integer version_number', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 'not-a-number'
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version_number'))).toBe(true);
    });
  });

  describe('field length limits', () => {
    it('fails when rule_number exceeds 50 characters', () => {
      const data = {
        rules: [{
          rule_number: 'A'.repeat(51),
          category: 'General',
          title: 'Test Rule',
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rule_number') && e.includes('50'))).toBe(true);
    });

    it('fails when title exceeds 500 characters', () => {
      const data = {
        rules: [{
          rule_number: 'GEN-1.1',
          category: 'General',
          title: 'A'.repeat(501),
          body: 'Test body',
          status: 'active',
          effective_from: '2026-01-01',
          version_number: 1
        }]
      };
      
      const result = validateImport(data, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('title') && e.includes('500'))).toBe(true);
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Run with: npm test -- --run scripts/rules/__tests__/validate-rules-import.test.mjs');
}
