/**
 * Unit tests for transcript-loader service
 */

import { describe, it, expect } from 'vitest';
import {
  parseTranscript,
  chunkTranscript,
  estimateTokens,
} from '../src/transcript-loader';
import type { HansardSession } from '../src/types';

describe('Transcript Loader', () => {
  describe('parseTranscript', () => {
    it('should parse Hansard session with sections', () => {
      const hansard: HansardSession = {
        takesSectionVOList: [
          {
            title: 'Test Section',
            content: '<p><strong>Speaker One:</strong> This is a test speech.</p>',
          },
        ],
      };

      const segments = parseTranscript(hansard);

      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('Speaker One');
      expect(segments[0].text).toContain('This is a test speech');
      expect(segments[0].section_title).toBe('Test Section');
    });

    it('should parse subsections', () => {
      const hansard: HansardSession = {
        takesSectionVOList: [
          {
            title: 'Main Section',
            subsections: [
              {
                title: 'Subsection One',
                content: '<p><strong>Minister:</strong> I rise to address this issue.</p>',
              },
            ],
          },
        ],
      };

      const segments = parseTranscript(hansard);

      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('Minister');
      expect(segments[0].section_title).toBe('Main Section');
      expect(segments[0].subsection_title).toBe('Subsection One');
    });

    it('should handle missing speaker tags', () => {
      const hansard: HansardSession = {
        takesSectionVOList: [
          {
            title: 'Section',
            content: '<p>This is content without a speaker tag.</p>',
          },
        ],
      };

      const segments = parseTranscript(hansard);

      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBeUndefined();
      expect(segments[0].text).toContain('This is content without a speaker tag');
    });

    it('should return empty array for empty Hansard', () => {
      const hansard: HansardSession = {
        takesSectionVOList: [],
      };

      const segments = parseTranscript(hansard);

      expect(segments).toHaveLength(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const text = 'This is a test'; // 14 chars ≈ 3.5 tokens → 4 tokens
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(4);
    });

    it('should handle empty string', () => {
      const tokens = estimateTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('chunkTranscript', () => {
    it('should chunk transcript within token limits', () => {
      const segments = [
        {
          speaker: 'Speaker A',
          text: 'This is the first segment. '.repeat(50), // ~100 tokens
          section_title: 'Section 1',
        },
        {
          speaker: 'Speaker B',
          text: 'This is the second segment. '.repeat(50), // ~100 tokens
          section_title: 'Section 1',
        },
      ];

      const chunks = chunkTranscript(segments, 150, 20);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk, index) => {
        expect(chunk.chunk_index).toBe(index);
        expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(150);
      });
    });

    it('should preserve speaker and section info', () => {
      const segments = [
        {
          speaker: 'Minister',
          text: 'Important policy statement.',
          section_title: 'Policy Discussion',
        },
      ];

      const chunks = chunkTranscript(segments);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].speaker).toBe('Minister');
      expect(chunks[0].section_title).toBe('Policy Discussion');
    });

    it('should create overlap between chunks', () => {
      const longText = 'word '.repeat(200); // Create long text
      const segments = [
        {
          text: longText,
          section_title: 'Section',
        },
      ];

      const chunks = chunkTranscript(segments, 100, 20);

      // Should create multiple chunks with overlap
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
