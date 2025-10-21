import { describe, it, expect, beforeEach, vi } from 'vitest';
import { R2Manager } from '../../src/storage/r2-manager';

describe('R2Manager', () => {
  let manager: R2Manager;
  let mockBucket: any;

  beforeEach(() => {
    mockBucket = {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    };

    manager = new R2Manager({
      bucket: mockBucket,
      publicUrl: 'https://pub-capless.r2.dev'
    });
  });

  describe('uploadVideo', () => {
    it('should upload video successfully', async () => {
      mockBucket.put.mockResolvedValue(undefined);

      const videoData = new ArrayBuffer(1024);
      const url = await manager.uploadVideo('videos/test.mp4', videoData);

      expect(url).toBe('https://pub-capless.r2.dev/videos/test.mp4');
      expect(mockBucket.put).toHaveBeenCalledWith(
        'videos/test.mp4',
        videoData,
        expect.objectContaining({
          httpMetadata: { contentType: 'video/mp4' }
        })
      );
    });

    it('should handle upload errors', async () => {
      mockBucket.put.mockRejectedValue(new Error('Upload failed'));

      await expect(
        manager.uploadVideo('test.mp4', new ArrayBuffer(10))
      ).rejects.toThrow('Failed to upload video to R2');
    });
  });

  describe('downloadVideo', () => {
    it('should download video successfully', async () => {
      const mockData = new ArrayBuffer(1024);
      mockBucket.get.mockResolvedValue({
        arrayBuffer: async () => mockData
      });

      const data = await manager.downloadVideo('videos/test.mp4');

      expect(data).toBe(mockData);
      expect(mockBucket.get).toHaveBeenCalledWith('videos/test.mp4');
    });

    it('should throw when video not found', async () => {
      mockBucket.get.mockResolvedValue(null);

      await expect(
        manager.downloadVideo('nonexistent.mp4')
      ).rejects.toThrow('Video not found');
    });
  });

  describe('deleteVideo', () => {
    it('should delete video successfully', async () => {
      mockBucket.delete.mockResolvedValue(undefined);

      await manager.deleteVideo('videos/test.mp4');

      expect(mockBucket.delete).toHaveBeenCalledWith('videos/test.mp4');
    });
  });

  describe('cleanup', () => {
    it('should delete old files', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      mockBucket.list.mockResolvedValue({
        objects: [
          { key: 'renders/old1.mp4', size: 1024 * 1024 * 50, uploaded: oldDate },
          { key: 'renders/old2.mp4', size: 1024 * 1024 * 30, uploaded: oldDate },
          { key: 'renders/recent.mp4', size: 1024 * 1024 * 20, uploaded: recentDate }
        ]
      });

      mockBucket.delete.mockResolvedValue(undefined);

      const olderThan = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
      const result = await manager.cleanup(olderThan, 'renders/*', false);

      expect(result.deleted_count).toBe(2);
      expect(result.deleted_files).toHaveLength(2);
      expect(result.deleted_files).toContain('renders/old1.mp4');
      expect(result.deleted_files).toContain('renders/old2.mp4');
      expect(result.freed_space_mb).toBeCloseTo(80, 0);
    });

    it('should support dry run mode', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      mockBucket.list.mockResolvedValue({
        objects: [
          { key: 'renders/old1.mp4', size: 1024 * 1024 * 50, uploaded: oldDate },
          { key: 'renders/old2.mp4', size: 1024 * 1024 * 30, uploaded: oldDate }
        ]
      });

      const olderThan = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const result = await manager.cleanup(olderThan, 'renders/*', true);

      expect(result.deleted_count).toBe(0);
      expect(result.would_delete_count).toBe(2);
      expect(mockBucket.delete).not.toHaveBeenCalled();
    });

    it('should handle empty bucket', async () => {
      mockBucket.list.mockResolvedValue({ objects: [] });

      const result = await manager.cleanup(Date.now(), 'renders/*', false);

      expect(result.deleted_count).toBe(0);
      expect(result.freed_space_mb).toBe(0);
    });
  });

  describe('checkHealth', () => {
    it('should return true when bucket is accessible', async () => {
      mockBucket.list.mockResolvedValue({ objects: [] });

      const result = await manager.checkHealth();

      expect(result).toBe(true);
    });

    it('should return false when bucket is inaccessible', async () => {
      mockBucket.list.mockRejectedValue(new Error('Access denied'));

      const result = await manager.checkHealth();

      expect(result).toBe(false);
    });
  });
});
