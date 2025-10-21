import { PublishMetadata, PlatformResult } from '../types/schemas';

export interface YouTubeConfig {
  apiKey: string;
}

export class YouTubePublisher {
  private config: YouTubeConfig;
  private apiBase = 'https://www.googleapis.com/youtube/v3';

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  async publish(videoUrl: string, metadata: PublishMetadata): Promise<PlatformResult> {
    try {
      // YouTube API requires OAuth2 for uploading videos
      // For now, we'll use the Data API to create a playlist item or use the upload endpoint

      // Download video
      const videoBlob = await this.downloadVideo(videoUrl);

      // Upload video as YouTube Short
      const videoId = await this.uploadVideo(videoBlob, metadata);

      // Get video URL
      const url = `https://www.youtube.com/shorts/${videoId}`;

      return {
        platform: 'youtube',
        success: true,
        url,
        post_id: videoId
      };
    } catch (error) {
      return {
        platform: 'youtube',
        success: false,
        error: String(error)
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Check if API key is valid
      const response = await fetch(
        `${this.apiBase}/videos?part=snippet&chart=mostPopular&maxResults=1&key=${this.config.apiKey}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async uploadVideo(videoBlob: Blob, metadata: PublishMetadata): Promise<string> {
    const { title, description, hashtags } = metadata;

    // Format description with hashtags
    const fullDescription = this.formatDescription(description, hashtags);

    // Create multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // Metadata part
    const metadataPart = JSON.stringify({
      snippet: {
        title: title.substring(0, 100), // YouTube title limit
        description: fullDescription,
        categoryId: '22', // People & Blogs
        tags: hashtags
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    });

    const metadataHeader = [
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadataPart
    ].join('\r\n');

    // Video part
    const videoHeader = [
      'Content-Type: video/mp4',
      '',
      ''
    ].join('\r\n');

    // Combine parts
    const body = delimiter + metadataHeader + delimiter + videoHeader;
    const bodyBuffer = new TextEncoder().encode(body);
    const videoBuffer = await videoBlob.arrayBuffer();
    const closeBuffer = new TextEncoder().encode(closeDelimiter);

    // Concatenate buffers
    const fullBody = new Uint8Array(
      bodyBuffer.length + videoBuffer.byteLength + closeBuffer.length
    );
    fullBody.set(bodyBuffer, 0);
    fullBody.set(new Uint8Array(videoBuffer), bodyBuffer.length);
    fullBody.set(closeBuffer, bodyBuffer.length + videoBuffer.byteLength);

    // Upload
    const response = await fetch(
      `${this.apiBase}/videos?uploadType=multipart&part=snippet,status&key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: fullBody
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YouTube upload failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.id;
  }

  private async downloadVideo(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }
    return await response.blob();
  }

  private formatDescription(description: string, hashtags: string[]): string {
    let fullDescription = description;

    // Add hashtags to description
    if (hashtags.length > 0) {
      const formattedTags = hashtags.map(tag =>
        tag.startsWith('#') ? tag : `#${tag}`
      ).join(' ');
      fullDescription += `\n\n${formattedTags}`;
    }

    // Add Shorts identifier
    fullDescription += '\n\n#Shorts';

    // YouTube description limit is 5000 characters
    if (fullDescription.length > 5000) {
      fullDescription = fullDescription.substring(0, 4997) + '...';
    }

    return fullDescription;
  }
}
