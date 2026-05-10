#!/usr/bin/env node
/**
 * Rules Import Validation Utility
 *
 * Validates JSON rule imports against the required schema.
 * Default input: data/rules/sample-rules-import.json
 *
 * Usage:
 *   node scripts/rules/validate-rules-import.mjs [path/to/import.json]
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = resolve(__dirname, '../../data/rules/sample-rules-import.json');

const ALLOWED_STATUSES = ['active', 'superseded', 'proposed', 'deleted'];
const REQUIRED_FIELDS = ['rule_number', 'category', 'title', 'body', 'status', 'effective_from', 'version_number'];
const MAX_FIELD_LENGTHS = {
  rule_number: 50,
  category: 100,
  class_scope: 255,
  title: 500,
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function isValidDate(dateStr) {
  return formatDate(dateStr) !== null;
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

export function validateImport(data, sourcePath) {
  const errors = [];
  const warnings = [];
  const duplicates = new Set();
  const seenRuleNumbers = new Set();

  // Top-level validation
  if (!data || typeof data !== 'object') {
    errors.push('Import must be a JSON object');
    return { valid: false, errors, warnings, duplicates: [], stats: {} };
  }

  if (!Array.isArray(data.rules)) {
    errors.push('Import must contain a "rules" array');
    return { valid: false, errors, warnings, duplicates: [], stats: {} };
  }

  if (data.rules.length === 0) {
    warnings.push('Rules array is empty');
  }

  // Validate each rule
  data.rules.forEach((rule, index) => {
    const ruleRef = `Rule #${index + 1}`;

    // Required fields
    REQUIRED_FIELDS.forEach(field => {
      if (!(field in rule) || rule[field] === null || rule[field] === undefined) {
        errors.push(`${ruleRef}: Missing required field "${field}"`);
      }
    });

    // Field type and content validation
    if (rule.rule_number !== undefined) {
      if (typeof rule.rule_number !== 'string' || rule.rule_number.trim() === '') {
        errors.push(`${ruleRef}: rule_number must be a non-empty string`);
      } else if (rule.rule_number.length > MAX_FIELD_LENGTHS.rule_number) {
        errors.push(`${ruleRef}: rule_number exceeds ${MAX_FIELD_LENGTHS.rule_number} characters`);
      } else {
        // Check for duplicates
        const normalized = rule.rule_number.trim().toLowerCase();
        if (seenRuleNumbers.has(normalized)) {
          duplicates.add(rule.rule_number.trim());
          errors.push(`${ruleRef}: Duplicate rule_number "${rule.rule_number}"`);
        }
        seenRuleNumbers.add(normalized);
      }
    }

    if (rule.category !== undefined) {
      if (typeof rule.category !== 'string' || rule.category.trim() === '') {
        errors.push(`${ruleRef}: category must be a non-empty string`);
      } else if (rule.category.length > MAX_FIELD_LENGTHS.category) {
        errors.push(`${ruleRef}: category exceeds ${MAX_FIELD_LENGTHS.category} characters`);
      }
    }

    if (rule.class_scope !== undefined && rule.class_scope !== null) {
      if (typeof rule.class_scope !== 'string') {
        errors.push(`${ruleRef}: class_scope must be a string or null`);
      } else if (rule.class_scope.length > MAX_FIELD_LENGTHS.class_scope) {
        errors.push(`${ruleRef}: class_scope exceeds ${MAX_FIELD_LENGTHS.class_scope} characters`);
      }
    }

    if (rule.title !== undefined) {
      if (typeof rule.title !== 'string' || rule.title.trim() === '') {
        errors.push(`${ruleRef}: title must contain non-whitespace content`);
      } else if (rule.title.length > MAX_FIELD_LENGTHS.title) {
        errors.push(`${ruleRef}: title exceeds ${MAX_FIELD_LENGTHS.title} characters`);
      }
    }

    if (rule.body !== undefined) {
      if (typeof rule.body !== 'string' || rule.body.trim() === '') {
        errors.push(`${ruleRef}: body must contain non-whitespace content`);
      }
    }

    if (rule.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(rule.status)) {
        errors.push(`${ruleRef}: status must be one of ${ALLOWED_STATUSES.join(', ')}, got "${rule.status}"`);
      }
    }

    if (rule.effective_from !== undefined) {
      if (!isValidDate(rule.effective_from)) {
        errors.push(`${ruleRef}: effective_from must be a valid date (YYYY-MM-DD), got "${rule.effective_from}"`);
      }
    }

    if (rule.effective_to !== undefined && rule.effective_to !== null) {
      if (!isValidDate(rule.effective_to)) {
        errors.push(`${ruleRef}: effective_to must be a valid date or null, got "${rule.effective_to}"`);
      }
    }

    // Date ordering check
    if (isValidDate(rule.effective_from) && isValidDate(rule.effective_to)) {
      const from = new Date(rule.effective_from);
      const to = new Date(rule.effective_to);
      if (to < from) {
        errors.push(`${ruleRef}: effective_to (${rule.effective_to}) must be later than effective_from (${rule.effective_from})`);
      }
    }

    if (rule.version_number !== undefined) {
      if (!Number.isInteger(rule.version_number) || rule.version_number < 1) {
        errors.push(`${ruleRef}: version_number must be a positive integer (>= 1), got ${rule.version_number}`);
      }
    }

    if (rule.change_summary !== undefined && typeof rule.change_summary !== 'string') {
      warnings.push(`${ruleRef}: change_summary should be a string`);
    }
  });

  // Metadata validation (optional but recommended)
  if (!data.metadata) {
    warnings.push('Missing metadata block (optional but recommended)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    duplicates: Array.from(duplicates),
    stats: {
      total: data.rules.length,
      validCount: data.rules.length - new Set(errors.filter(e => e.includes('Rule #')).map(e => {
        const match = e.match(/Rule #(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })).size,
    }
  };
}

function main() {
  const inputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_INPUT;

  console.log(`Validating: ${inputPath}`);
  console.log('');

  if (!existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    const content = readFileSync(inputPath, 'utf-8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Invalid JSON - ${err.message}`);
    process.exit(1);
  }

  const result = validateImport(data, inputPath);

  // Print summary
  console.log('=== Validation Summary ===');
  console.log(`Total rules:     ${result.stats.total}`);
  console.log(`Valid rules:     ${result.stats.validCount}`);
  console.log(`Errors:          ${result.errors.length}`);
  console.log(`Warnings:        ${result.warnings.length}`);
  console.log(`Duplicates:      ${result.duplicates.length}`);
  console.log('');

  // Print errors
  if (result.errors.length > 0) {
    console.log('=== Errors ===');
    result.errors.forEach(err => console.log(`  ✗ ${err}`));
    console.log('');
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('=== Warnings ===');
    result.warnings.forEach(warn => console.log(`  • ${warn}`));
    console.log('');
  }

  // Print duplicates summary
  if (result.duplicates.length > 0) {
    console.log('=== Duplicate rule_numbers ===');
    result.duplicates.forEach(dup => console.log(`  • ${dup}`));
    console.log('');
  }

  // Final status
  if (result.valid) {
    console.log('✓ Validation passed');
    process.exit(0);
  } else {
    console.log('✗ Validation failed');
    process.exit(1);
  }
}

// Run main only when executed directly (not when imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
