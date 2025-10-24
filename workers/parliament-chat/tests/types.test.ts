/**
 * Unit tests for type schemas and validation
 */

import { describe, it, expect } from 'vitest';
import {
  ChatRequestSchema,
  EmbedSessionRequestSchema,
  BulkEmbedRequestSchema,
} from '../src/types';

describe('Type Schemas', () => {
  describe('ChatRequestSchema', () => {
    it('should validate valid chat request', () => {
      const validRequest = {
        session_date: '22-09-2024',
        question: 'What was discussed about transport?',
        max_results: 5,
      };

      const result = ChatRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const invalidRequest = {
        session_date: '2024-09-22', // Wrong format
        question: 'Test question',
      };

      const result = ChatRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject empty question', () => {
      const invalidRequest = {
        session_date: '22-09-2024',
        question: '',
      };

      const result = ChatRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should use default max_results', () => {
      const request = {
        session_date: '22-09-2024',
        question: 'Test',
      };

      const result = ChatRequestSchema.parse(request);
      expect(result.max_results).toBe(5);
    });
  });

  describe('EmbedSessionRequestSchema', () => {
    it('should validate valid embed request', () => {
      const validRequest = {
        session_date: '22-09-2024',
        force: true,
      };

      const result = EmbedSessionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should use default force value', () => {
      const request = {
        session_date: '22-09-2024',
      };

      const result = EmbedSessionRequestSchema.parse(request);
      expect(result.force).toBe(false);
    });
  });

  describe('BulkEmbedRequestSchema', () => {
    it('should validate valid bulk embed request', () => {
      const validRequest = {
        start_date: '01-09-2024',
        end_date: '30-09-2024',
        limit: 10,
      };

      const result = BulkEmbedRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should allow optional dates', () => {
      const request = {
        limit: 5,
      };

      const result = BulkEmbedRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should use default limit', () => {
      const request = {};

      const result = BulkEmbedRequestSchema.parse(request);
      expect(result.limit).toBe(10);
    });

    it('should reject limit over 100', () => {
      const request = {
        limit: 150,
      };

      const result = BulkEmbedRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
