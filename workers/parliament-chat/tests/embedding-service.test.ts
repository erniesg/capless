/**
 * Unit tests for embedding-service
 */

import { describe, it, expect, vi } from 'vitest';
import { CLOUDFLARE_PROVIDER, OPENAI_PROVIDER } from '../src/embedding-service';

describe('Embedding Service', () => {
  describe('Provider Configuration', () => {
    it('should have correct Cloudflare provider config', () => {
      expect(CLOUDFLARE_PROVIDER.name).toBe('cloudflare');
      expect(CLOUDFLARE_PROVIDER.dimensions).toBe(768);
      expect(CLOUDFLARE_PROVIDER.maxBatchSize).toBeGreaterThan(0);
    });

    it('should have correct OpenAI provider config', () => {
      expect(OPENAI_PROVIDER.name).toBe('openai');
      expect(OPENAI_PROVIDER.dimensions).toBe(1536);
      expect(OPENAI_PROVIDER.maxBatchSize).toBeGreaterThan(0);
    });
  });

  // Note: Full integration tests with actual API calls should be done separately
  // These are unit tests for the service structure
});
