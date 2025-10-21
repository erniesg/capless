import { Env, Persona, Moment } from '../types';

export class ThumbnailGenerator {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Generate thumbnail with persona branding
   * Uses Cloudflare AI for image generation
   */
  async generateThumbnail(
    moment: Moment,
    persona: Persona,
    template: string = 'default'
  ): Promise<{
    thumbnail_url: string;
    dimensions: { width: number; height: number };
  }> {
    // For TikTok format, we use 9:16 aspect ratio (1080x1920)
    const width = 1080;
    const height = 1920;

    // Generate prompt for image generation based on persona and moment
    const imagePrompt = this.createImagePrompt(moment, persona);

    // Generate thumbnail using Cloudflare AI
    // Note: Using text-based thumbnail generation for MVP
    // In production, would use image generation models
    const thumbnailData = await this.generateSimpleThumbnail(
      moment,
      persona,
      width,
      height
    );

    // Store in R2
    const thumbnail_url = await this.storeThumbnailInR2(
      thumbnailData,
      moment.moment_id,
      persona
    );

    return {
      thumbnail_url,
      dimensions: { width, height },
    };
  }

  /**
   * Create image generation prompt based on persona
   */
  private createImagePrompt(moment: Moment, persona: Persona): string {
    const personaBranding: Record<Persona, string> = {
      gen_z: 'vibrant neon colors, modern minimalist design, bold typography, TikTok aesthetic, high contrast, digital art style',
      kopitiam_uncle: 'warm earthy tones, kopitiam coffee shop vibes, retro Singapore aesthetic, nostalgic color palette',
      auntie: 'warm pastel colors, family-oriented design, concerned expression, WhatsApp group chat aesthetic',
      attenborough: 'documentary style, nature documentary aesthetic, sophisticated earth tones, BBC quality, elegant typography',
    };

    return `${personaBranding[persona]}, featuring quote "${moment.quote.substring(0, 100)}" from ${moment.speaker}, professional thumbnail for social media, 9:16 vertical format`;
  }

  /**
   * Generate simple text-based thumbnail (MVP implementation)
   * In production, would use Cloudflare AI image generation or external service
   */
  private async generateSimpleThumbnail(
    moment: Moment,
    persona: Persona,
    width: number,
    height: number
  ): Promise<ArrayBuffer> {
    // MVP: Generate SVG thumbnail with text overlay
    const svg = this.createSVGThumbnail(moment, persona, width, height);

    // Convert SVG to PNG (simplified - in production would use proper image library)
    // For now, return SVG as PNG
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(svg);
    return uint8Array.buffer as ArrayBuffer;
  }

  /**
   * Create SVG thumbnail with persona branding
   */
  private createSVGThumbnail(
    moment: Moment,
    persona: Persona,
    width: number,
    height: number
  ): string {
    const colors: Record<Persona, { bg: string; text: string; accent: string }> = {
      gen_z: { bg: '#000000', text: '#FFFFFF', accent: '#FF00FF' },
      kopitiam_uncle: { bg: '#3E2723', text: '#FFF3E0', accent: '#FF6F00' },
      auntie: { bg: '#FFF3E0', text: '#4E342E', accent: '#E91E63' },
      attenborough: { bg: '#1B5E20', text: '#E8F5E9', accent: '#4CAF50' },
    };

    const color = colors[persona];

    // Truncate quote for thumbnail
    const quote = moment.quote.length > 120
      ? moment.quote.substring(0, 120) + '...'
      : moment.quote;

    return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${color.bg}"/>

  <!-- Accent bar -->
  <rect x="0" y="100" width="${width}" height="10" fill="${color.accent}"/>

  <!-- Persona label -->
  <text x="540" y="80" text-anchor="middle" fill="${color.accent}" font-size="48" font-weight="bold" font-family="Arial, sans-serif">
    ${this.getPersonaLabel(persona)}
  </text>

  <!-- Quote -->
  <foreignObject x="80" y="200" width="${width - 160}" height="800">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 56px; line-height: 1.4; color: ${color.text}; font-weight: bold;">
      "${quote}"
    </div>
  </foreignObject>

  <!-- Speaker -->
  <text x="540" y="1100" text-anchor="middle" fill="${color.text}" font-size="40" font-family="Arial, sans-serif">
    ${moment.speaker}
  </text>

  <!-- Topic -->
  <text x="540" y="1160" text-anchor="middle" fill="${color.accent}" font-size="36" font-style="italic" font-family="Arial, sans-serif">
    ${moment.topic}
  </text>

  <!-- Bottom branding -->
  <text x="540" y="1800" text-anchor="middle" fill="${color.accent}" font-size="48" font-weight="bold" font-family="Arial, sans-serif">
    #Capless
  </text>
</svg>`.trim();
  }

  /**
   * Get display label for persona
   */
  private getPersonaLabel(persona: Persona): string {
    const labels: Record<Persona, string> = {
      gen_z: 'STRAIGHTOK AI',
      kopitiam_uncle: 'KOPITIAM UNCLE',
      auntie: 'ANXIOUS AUNTIE',
      attenborough: 'THE OBSERVER',
    };
    return labels[persona];
  }

  /**
   * Store thumbnail in R2 bucket
   */
  private async storeThumbnailInR2(
    thumbnailData: ArrayBuffer,
    moment_id: string,
    persona: Persona
  ): Promise<string> {
    const filename = `thumbnails/${moment_id}_${persona}.png`;

    await this.env.R2.put(filename, thumbnailData, {
      httpMetadata: {
        contentType: 'image/png',
      },
      customMetadata: {
        moment_id,
        persona,
        generated_at: new Date().toISOString(),
      },
    });

    // Return public URL
    const bucketDomain = this.env.ENVIRONMENT === 'production'
      ? 'capless.r2.dev'
      : 'capless-preview.r2.dev';

    return `https://${bucketDomain}/${filename}`;
  }
}
