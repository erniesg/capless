import { PublishMetadata, PlatformResult } from '../types/schemas';

export interface InstagramConfig {
  accessToken: string;
}

export class InstagramPublisher {
  private config: InstagramConfig;
  private apiBase = 'https://graph.instagram.com/v18.0';

  constructor(config: InstagramConfig) {
    this.config = config;
  }

  async publish(videoUrl: string, metadata: PublishMetadata): Promise<PlatformResult> {
    try {
      // Step 1: Get user's Instagram Business Account ID
      const accountId = await this.getInstagramAccountId();

      // Step 2: Create media container for Reels
      const containerId = await this.createMediaContainer(accountId, videoUrl, metadata);

      // Step 3: Publish the media container
      const mediaId = await this.publishMediaContainer(accountId, containerId);

      // Step 4: Get the permalink
      const permalink = await this.getMediaPermalink(mediaId);

      return {
        platform: 'instagram',
        success: true,
        url: permalink,
        post_id: mediaId
      };
    } catch (error) {
      return {
        platform: 'instagram',
        success: false,
        error: String(error)
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/me?access_token=${this.config.accessToken}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getInstagramAccountId(): Promise<string> {
    const response = await fetch(
      `${this.apiBase}/me?fields=instagram_business_account&access_token=${this.config.accessToken}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Instagram account: ${response.status}`);
    }

    const data = await response.json() as any;
    if (!data.instagram_business_account?.id) {
      throw new Error('No Instagram Business Account found');
    }

    return data.instagram_business_account.id;
  }

  private async createMediaContainer(
    accountId: string,
    videoUrl: string,
    metadata: PublishMetadata
  ): Promise<string> {
    const caption = this.formatCaption(metadata);

    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
      access_token: this.config.accessToken
    });

    const response = await fetch(
      `${this.apiBase}/${accountId}/media?${params.toString()}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create media container: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.id;
  }

  private async publishMediaContainer(accountId: string, containerId: string): Promise<string> {
    const params = new URLSearchParams({
      creation_id: containerId,
      access_token: this.config.accessToken
    });

    const response = await fetch(
      `${this.apiBase}/${accountId}/media_publish?${params.toString()}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to publish media: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.id;
  }

  private async getMediaPermalink(mediaId: string): Promise<string> {
    const params = new URLSearchParams({
      fields: 'permalink',
      access_token: this.config.accessToken
    });

    const response = await fetch(
      `${this.apiBase}/${mediaId}?${params.toString()}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get permalink: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.permalink || `https://www.instagram.com/p/${mediaId}`;
  }

  private formatCaption(metadata: PublishMetadata): string {
    const { title, description, hashtags } = metadata;

    // Combine description and hashtags
    let caption = description;

    // Add hashtags
    if (hashtags.length > 0) {
      const formattedTags = hashtags.map(tag =>
        tag.startsWith('#') ? tag : `#${tag}`
      ).join(' ');
      caption += ` ${formattedTags}`;
    }

    // Instagram caption limit is 2200 characters
    if (caption.length > 2200) {
      caption = caption.substring(0, 2197) + '...';
    }

    return caption;
  }
}
