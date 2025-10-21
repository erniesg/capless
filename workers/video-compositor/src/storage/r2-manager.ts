export interface R2Config {
  bucket: R2Bucket;
  publicUrl: string;
}

export interface CleanupResult {
  deleted_count: number;
  freed_space_mb: number;
  deleted_files: string[];
  would_delete_count?: number;
}

export class R2Manager {
  private config: R2Config;

  constructor(config: R2Config) {
    this.config = config;
  }

  async uploadVideo(key: string, data: ArrayBuffer | ReadableStream): Promise<string> {
    try {
      await this.config.bucket.put(key, data, {
        httpMetadata: {
          contentType: 'video/mp4'
        }
      });

      return `${this.config.publicUrl}/${key}`;
    } catch (error) {
      throw new Error(`Failed to upload video to R2: ${error}`);
    }
  }

  async downloadVideo(key: string): Promise<ArrayBuffer> {
    try {
      const object = await this.config.bucket.get(key);
      if (!object) {
        throw new Error(`Video not found: ${key}`);
      }

      return await object.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to download video from R2: ${error}`);
    }
  }

  async deleteVideo(key: string): Promise<void> {
    try {
      await this.config.bucket.delete(key);
    } catch (error) {
      throw new Error(`Failed to delete video from R2: ${error}`);
    }
  }

  async cleanup(olderThan: number, pattern: string, dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
      deleted_count: 0,
      freed_space_mb: 0,
      deleted_files: []
    };

    try {
      // Parse pattern to get prefix
      const prefix = this.parsePattern(pattern);

      // List all objects matching pattern
      const listed = await this.config.bucket.list({ prefix });

      if (!listed.objects) {
        return result;
      }

      // Filter by age
      const toDelete: string[] = [];
      let totalSize = 0;

      for (const object of listed.objects) {
        const uploadedAt = object.uploaded.getTime();

        if (uploadedAt < olderThan) {
          toDelete.push(object.key);
          totalSize += object.size;
        }
      }

      // Dry run mode
      if (dryRun) {
        result.would_delete_count = toDelete.length;
        result.freed_space_mb = totalSize / (1024 * 1024);
        return result;
      }

      // Delete files
      for (const key of toDelete) {
        try {
          await this.config.bucket.delete(key);
          result.deleted_files.push(key);
          result.deleted_count++;
        } catch (error) {
          console.error(`Failed to delete ${key}:`, error);
        }
      }

      result.freed_space_mb = totalSize / (1024 * 1024);

      return result;
    } catch (error) {
      throw new Error(`Cleanup failed: ${error}`);
    }
  }

  async getVideoUrl(key: string): Promise<string> {
    return `${this.config.publicUrl}/${key}`;
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Try to list objects with limit 1
      const listed = await this.config.bucket.list({ limit: 1 });
      return listed !== null;
    } catch {
      return false;
    }
  }

  private parsePattern(pattern: string): string {
    // Convert glob pattern to R2 prefix
    // Example: "renders/*" -> "renders/"
    // Example: "videos/**/*.mp4" -> "videos/"

    if (pattern.includes('*')) {
      const parts = pattern.split('*')[0];
      return parts.endsWith('/') ? parts : parts + '/';
    }

    return pattern;
  }
}
