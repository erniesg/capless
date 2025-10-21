/**
 * R2 storage layer for Hansard transcripts
 */

import { StorageError, type HansardJSON, type ProcessedTranscript } from "../types";

/**
 * Generate R2 key for raw Hansard JSON
 * Format: transcripts/raw/{year}/{month}/{day}/{sitting}.json
 */
export function generateRawTranscriptKey(
  sittingDate: string,
  transcriptId: string
): string {
  const [year, month, day] = sittingDate.split("-");
  return `transcripts/raw/${year}/${month}/${day}/${transcriptId}.json`;
}

/**
 * Generate R2 key for processed transcript
 * Format: transcripts/processed/{transcript_id}.json
 */
export function generateProcessedTranscriptKey(transcriptId: string): string {
  return `transcripts/processed/${transcriptId}.json`;
}

/**
 * Store raw Hansard JSON in R2
 */
export async function storeRawTranscript(
  r2: R2Bucket,
  hansard: HansardJSON,
  transcriptId: string,
  sittingDate: string
): Promise<string> {
  try {
    const key = generateRawTranscriptKey(sittingDate, transcriptId);
    const content = JSON.stringify(hansard, null, 2);

    await r2.put(key, content, {
      httpMetadata: {
        contentType: "application/json",
      },
      customMetadata: {
        transcript_id: transcriptId,
        sitting_date: sittingDate,
        stored_at: new Date().toISOString(),
        version: "1.0",
        type: "raw_hansard",
      },
    });

    return key;
  } catch (error) {
    throw new StorageError(
      `Failed to store raw transcript: ${(error as Error).message}`,
      "put",
      generateRawTranscriptKey(sittingDate, transcriptId)
    );
  }
}

/**
 * Store processed transcript in R2
 */
export async function storeProcessedTranscript(
  r2: R2Bucket,
  transcript: ProcessedTranscript
): Promise<string> {
  try {
    const key = generateProcessedTranscriptKey(transcript.transcript_id);
    const content = JSON.stringify(transcript, null, 2);

    await r2.put(key, content, {
      httpMetadata: {
        contentType: "application/json",
      },
      customMetadata: {
        transcript_id: transcript.transcript_id,
        sitting_date: transcript.sitting_date,
        stored_at: new Date().toISOString(),
        version: "1.0",
        type: "processed_transcript",
        segment_count: transcript.segments.length.toString(),
        total_words: transcript.metadata.total_words.toString(),
      },
    });

    return key;
  } catch (error) {
    throw new StorageError(
      `Failed to store processed transcript: ${(error as Error).message}`,
      "put",
      generateProcessedTranscriptKey(transcript.transcript_id)
    );
  }
}

/**
 * Retrieve processed transcript from R2
 */
export async function getProcessedTranscript(
  r2: R2Bucket,
  transcriptId: string
): Promise<ProcessedTranscript | null> {
  try {
    const key = generateProcessedTranscriptKey(transcriptId);
    const object = await r2.get(key);

    if (!object) {
      return null;
    }

    const content = await object.text();
    return JSON.parse(content) as ProcessedTranscript;
  } catch (error) {
    throw new StorageError(
      `Failed to retrieve processed transcript: ${(error as Error).message}`,
      "get",
      generateProcessedTranscriptKey(transcriptId)
    );
  }
}

/**
 * Check if transcript exists in R2
 */
export async function transcriptExists(
  r2: R2Bucket,
  transcriptId: string
): Promise<boolean> {
  try {
    const key = generateProcessedTranscriptKey(transcriptId);
    const object = await r2.head(key);
    return object !== null;
  } catch (error) {
    throw new StorageError(
      `Failed to check transcript existence: ${(error as Error).message}`,
      "head",
      generateProcessedTranscriptKey(transcriptId)
    );
  }
}

/**
 * Generate public URL for R2 object
 * Requires R2 bucket to have public access configured
 */
export function generatePublicURL(
  bucketName: string,
  key: string,
  accountId?: string
): string {
  if (accountId) {
    return `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
  }

  // Fallback to standard R2 public URL format
  return `https://pub-${bucketName}.r2.dev/${key}`;
}

/**
 * Store both raw and processed transcripts
 * Returns URLs for both stored objects
 */
export async function storeTranscripts(
  r2: R2Bucket,
  hansard: HansardJSON,
  transcript: ProcessedTranscript,
  bucketName: string = "capless"
): Promise<{ raw: string; processed: string }> {
  try {
    // Store both in parallel
    const [rawKey, processedKey] = await Promise.all([
      storeRawTranscript(r2, hansard, transcript.transcript_id, transcript.sitting_date),
      storeProcessedTranscript(r2, transcript),
    ]);

    return {
      raw: generatePublicURL(bucketName, rawKey),
      processed: generatePublicURL(bucketName, processedKey),
    };
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }

    throw new StorageError(
      `Failed to store transcripts: ${(error as Error).message}`
    );
  }
}
