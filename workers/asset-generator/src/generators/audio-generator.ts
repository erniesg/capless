import { Env, Persona } from '../types';
import { getVoiceDNA } from '../personas/voice-dna';

export class AudioGenerator {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Generate TTS audio using ElevenLabs API
   */
  async generateAudio(
    script: string,
    persona: Persona,
    speed: number = 1.0
  ): Promise<{
    audio_url: string;
    duration: number;
    voice_id: string;
  }> {
    const voiceDNA = getVoiceDNA(persona, this.env);

    if (!voiceDNA.voice_id) {
      throw new Error(`Voice ID not configured for persona: ${persona}`);
    }

    // Remove emojis from script for TTS (they don't speak well)
    const cleanScript = this.cleanScriptForTTS(script);

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceDNA.voice_id}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: cleanScript,
          model_id: this.env.ELEVENLABS_MODEL,
          voice_settings: {
            stability: this.getStabilityForPersona(persona),
            similarity_boost: 0.75,
            style: this.getStyleForPersona(persona),
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    // Get audio data
    const audioData = await response.arrayBuffer();

    // Apply speed adjustment if needed
    let finalAudioData = audioData;
    if (speed !== 1.0) {
      finalAudioData = await this.adjustSpeed(audioData, speed);
    }

    // Calculate duration (estimate based on word count and speed)
    const wordCount = cleanScript.split(/\s+/).length;
    const baseDuration = this.estimateDuration(wordCount, persona);
    const adjustedDuration = baseDuration / speed;

    // Store in R2
    const audio_url = await this.storeAudioInR2(
      finalAudioData,
      persona,
      Date.now().toString()
    );

    return {
      audio_url,
      duration: adjustedDuration,
      voice_id: voiceDNA.voice_id,
    };
  }

  /**
   * Clean script for TTS by removing emojis and formatting
   */
  private cleanScriptForTTS(script: string): string {
    // Remove emojis (comprehensive emoji ranges)
    let cleaned = script.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E0}-\u{1F1FF}]/gu, '');

    // Remove markdown formatting
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/\*/g, '');
    cleaned = cleaned.replace(/_/g, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Get stability setting for persona (affects consistency vs. expressiveness)
   */
  private getStabilityForPersona(persona: Persona): number {
    const stabilityMap: Record<Persona, number> = {
      gen_z: 0.4, // More expressive, less stable
      kopitiam_uncle: 0.5, // Balanced
      auntie: 0.3, // Very expressive (anxious energy)
      attenborough: 0.7, // Very stable (measured narration)
    };
    return stabilityMap[persona];
  }

  /**
   * Get style setting for persona (affects emotional range)
   */
  private getStyleForPersona(persona: Persona): number {
    const styleMap: Record<Persona, number> = {
      gen_z: 0.8, // High style/emotion
      kopitiam_uncle: 0.7, // Moderate-high
      auntie: 0.9, // Maximum emotion
      attenborough: 0.4, // Restrained emotion
    };
    return styleMap[persona];
  }

  /**
   * Estimate audio duration based on word count and persona
   */
  private estimateDuration(wordCount: number, persona: Persona): number {
    const wordsPerSecond: Record<Persona, number> = {
      gen_z: 3.5,
      kopitiam_uncle: 3.2,
      auntie: 3.0,
      attenborough: 2.5,
    };

    return wordCount / wordsPerSecond[persona];
  }

  /**
   * Adjust audio speed (simplified - in production would use FFmpeg)
   */
  private async adjustSpeed(audioData: ArrayBuffer, speed: number): Promise<ArrayBuffer> {
    // For MVP, we'll return the original audio
    // In production, this would use FFmpeg or audio processing library
    // to adjust playback speed without changing pitch

    // TODO: Implement proper speed adjustment with FFmpeg
    console.warn(`Speed adjustment to ${speed}x not yet implemented - returning original audio`);
    return audioData;
  }

  /**
   * Store audio file in R2 bucket
   */
  private async storeAudioInR2(
    audioData: ArrayBuffer,
    persona: Persona,
    timestamp: string
  ): Promise<string> {
    const filename = `audio/moment_${timestamp}_${persona}.mp3`;

    await this.env.R2.put(filename, audioData, {
      httpMetadata: {
        contentType: 'audio/mpeg',
      },
      customMetadata: {
        persona,
        generated_at: new Date().toISOString(),
      },
    });

    // Return public URL (assumes R2 bucket has public access configured)
    const bucketDomain = this.env.ENVIRONMENT === 'production'
      ? 'capless.r2.dev'
      : 'capless-preview.r2.dev';

    return `https://${bucketDomain}/${filename}`;
  }

  /**
   * Check if ElevenLabs API is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.env.ELEVENLABS_API_KEY,
        },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
