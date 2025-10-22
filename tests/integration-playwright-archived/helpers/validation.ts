/**
 * Schema validation helpers for integration tests
 * Validates API responses against worker TypeScript schemas
 */

import { z, ZodSchema } from 'zod';
import { APIResponse } from '@playwright/test';

// Re-export all schemas from mocks for validation
export * from '../mocks/openai';
export * from '../mocks/elevenlabs';
export * from '../mocks/modal';
export * from '../mocks/parliament';
export * from '../mocks/youtube';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  data?: any;
}

/**
 * Validate data against a Zod schema
 */
export function validateSchema<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult {
  try {
    const parsed = schema.parse(data);
    return {
      valid: true,
      data: parsed,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => {
        const path = err.path.join('.');
        return `${context ? `${context}.` : ''}${path}: ${err.message}`;
      });
      return {
        valid: false,
        errors,
      };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}

/**
 * Validate and throw on error (for use in tests)
 */
export function assertSchema<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = validateSchema(schema, data, context);
  if (!result.valid) {
    throw new Error(
      `Schema validation failed${context ? ` for ${context}` : ''}:\n${result.errors?.join('\n')}`
    );
  }
  return result.data as T;
}

/**
 * Validate HTTP response body against schema
 */
export async function validateResponse<T>(
  response: APIResponse,
  schema: ZodSchema<T>,
  context?: string
): Promise<ValidationResult> {
  try {
    const data = await response.json();
    return validateSchema(schema, data, context);
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse response JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Assert HTTP response matches schema
 */
export async function assertResponse<T>(
  response: APIResponse,
  schema: ZodSchema<T>,
  context?: string
): Promise<T> {
  const result = await validateResponse(response, schema, context);
  if (!result.valid) {
    throw new Error(
      `Response validation failed${context ? ` for ${context}` : ''}:\n${result.errors?.join('\n')}`
    );
  }
  return result.data as T;
}

/**
 * Validate response status code
 */
export function assertStatusCode(
  response: APIResponse,
  expectedStatus: number,
  context?: string
): void {
  const actualStatus = response.status();
  if (actualStatus !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${actualStatus}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate response is successful (2xx)
 */
export function assertSuccess(response: APIResponse, context?: string): void {
  const status = response.status();
  if (!response.ok()) {
    throw new Error(
      `Expected successful response but got ${status}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate response headers contain expected values
 */
export function assertHeaders(
  response: APIResponse,
  expectedHeaders: Record<string, string>,
  context?: string
): void {
  const errors: string[] = [];

  for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = response.headers()[key];
    if (actualValue !== expectedValue) {
      errors.push(`Header "${key}": expected "${expectedValue}", got "${actualValue}"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Header validation failed${context ? ` for ${context}` : ''}:\n${errors.join('\n')}`
    );
  }
}

/**
 * Validate array contains expected items
 */
export function assertArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  if (!array.some(predicate)) {
    throw new Error(message || 'Array does not contain expected item');
  }
}

/**
 * Validate array length
 */
export function assertArrayLength<T>(
  array: T[],
  expectedLength: number,
  context?: string
): void {
  if (array.length !== expectedLength) {
    throw new Error(
      `Expected array length ${expectedLength} but got ${array.length}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate array length is within range
 */
export function assertArrayLengthRange<T>(
  array: T[],
  min: number,
  max: number,
  context?: string
): void {
  if (array.length < min || array.length > max) {
    throw new Error(
      `Expected array length between ${min} and ${max} but got ${array.length}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate object has required keys
 */
export function assertObjectHasKeys(
  obj: Record<string, any>,
  requiredKeys: string[],
  context?: string
): void {
  const missingKeys = requiredKeys.filter(key => !(key in obj));
  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required keys: ${missingKeys.join(', ')}${context ? ` in ${context}` : ''}`
    );
  }
}

/**
 * Validate value is within range
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  context?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      `Expected value between ${min} and ${max} but got ${value}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate string matches pattern
 */
export function assertStringMatches(
  value: string,
  pattern: RegExp,
  context?: string
): void {
  if (!pattern.test(value)) {
    throw new Error(
      `String "${value}" does not match pattern ${pattern}${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate URL is well-formed
 */
export function assertValidURL(value: string, context?: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(
      `Invalid URL: "${value}"${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate timestamp is ISO 8601
 */
export function assertValidISO8601(value: string, context?: string): void {
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!iso8601Pattern.test(value)) {
    throw new Error(
      `Invalid ISO 8601 timestamp: "${value}"${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Validate duration string (ISO 8601)
 */
export function assertValidDuration(value: string, context?: string): void {
  const durationPattern = /^PT(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?$/;
  if (!durationPattern.test(value)) {
    throw new Error(
      `Invalid ISO 8601 duration: "${value}"${context ? ` for ${context}` : ''}`
    );
  }
}

/**
 * Custom assertion helper
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Deep equality check
 */
export function assertEqual<T>(actual: T, expected: T, context?: string): void {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);

  if (actualStr !== expectedStr) {
    throw new Error(
      `Equality assertion failed${context ? ` for ${context}` : ''}:\n` +
      `Expected: ${expectedStr}\n` +
      `Actual: ${actualStr}`
    );
  }
}
