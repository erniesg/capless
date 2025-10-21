import { PublishMetadata, PlatformResult } from '../types/schemas';

export interface TikTokConfig {
  accessToken: string;
}

export class TikTokPublisher {
  private config: TikTokConfig;
  private apiBase = 'https://open-api.tiktok.com/share/video/upload/';

  constructor(config: TikTokConfig) {
    this.config = config;
  }

  async publish(videoUrl: string, metadata: PublishMetadata): Promise<PlatformResult> {
    try {
      // Download video from R2
      const videoBlob = await this.downloadVideo(videoUrl);

      // TikTok requires video to be uploaded via multipart form
      const formData = new FormData();
      formData.append('video', videoBlob, 'video.mp4');

      // Create post
      const caption = this.formatCaption(metadata);
      const response = await fetch(this.apiBase, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          video_url: videoUrl,
          caption,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TikTok API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      const shareId = data.data?.share_id || data.share_id;

      return {
        platform: 'tiktok',
        success: true,
        url: `https://www.tiktok.com/@capless/video/${shareId}`,
        post_id: shareId
      };
    } catch (error) {
      return {
        platform: 'tiktok',
        success: false,
        error: String(error)
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Check if we can get user info
      const response = await fetch('https://open-api.tiktok.com/oauth/userinfo/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async downloadVideo(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }
    return await response.blob();
  }

  private formatCaption(metadata: PublishMetadata): string {
    const { title, description, hashtags } = metadata;

    // Combine title and description
    let caption = `${title}\n\n${description}`;

    // Add hashtags
    if (hashtags.length > 0) {
      const formattedTags = hashtags.map(tag =>
        tag.startsWith('#') ? tag : `#${tag}`
      ).join(' ');
      caption += `\n\n${formattedTags}`;
    }

    // TikTok caption limit is 2200 characters
    if (caption.length > 2200) {
      caption = caption.substring(0, 2197) + '...';
    }

    return caption;
  }
}
