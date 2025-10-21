/**
 * Type definitions for Singapore Parliament Hansard ingestion
 */

// ============================================================================
// Input Types (Singapore Parliament API)
// ============================================================================

export interface HansardMetadata {
  parlimentNO: number;
  sessionNO: number;
  volumeNO?: number;
  sittingDate: string; // "02-07-2024"
  dateToDisplay: string; // "Tuesday, 2 July 2024"
  startTimeStr: string; // "12:00 noon"
  speaker: string; // Speaker of Parliament
}

export interface TakesSection {
  startPgNo: number;
  title: string;
  sectionType: "OS" | "OA" | "BILLS" | "PAPERS" | "OTHER";
  content: string; // HTML content with speeches
  questionCount?: number;
}

export interface AttendanceRecord {
  mpName: string;
  attendance: boolean;
}

export interface HansardJSON {
  metadata: HansardMetadata;
  takesSectionVOList: TakesSection[];
  attendanceList: AttendanceRecord[];
}

// ============================================================================
// Output Types (Processed Transcript)
// ============================================================================

export interface TranscriptSegment {
  id: string; // Unique segment ID: {transcript_id}-{index}
  speaker: string;
  text: string; // Clean text, HTML stripped
  timestamp?: string; // "12:00 pm", "2:30 pm"
  section_title: string;
  section_type: "OS" | "OA" | "BILLS" | "PAPERS" | "OTHER";
  page_number: number;
  segment_index: number;
  word_count: number;
  char_count: number;
}

export interface ProcessedTranscript {
  transcript_id: string; // Format: "2024-07-02-sitting-1"
  sitting_date: string; // ISO format: "2024-07-02"
  date_display: string; // "Tuesday, 2 July 2024"
  speakers: string[]; // Unique list of all speakers
  topics: string[]; // Unique list of section titles
  segments: TranscriptSegment[];
  metadata: {
    parliament_no: number;
    session_no: number;
    volume_no?: number;
    start_time: string;
    speaker_of_parliament: string;
    attendance: string[]; // List of MPs present
    total_segments: number;
    total_words: number;
    processing_timestamp: string; // ISO timestamp
    source_url: string;
  };
}

// ============================================================================
// Worker Request/Response Types
// ============================================================================

export interface IngestRequest {
  // Option 1: Provide sitting date (will fetch from API)
  sittingDate?: string; // "02-07-2024" or "2024-07-02"

  // Option 2: Provide pre-fetched Hansard JSON
  hansardJSON?: HansardJSON;

  // Option 3: Provide direct API URL
  hansardURL?: string;

  // Optional: Override transcript ID generation
  transcriptId?: string;

  // Optional: Skip R2 storage (for testing)
  skipStorage?: boolean;

  // Optional: Force re-processing even if cached
  forceRefresh?: boolean;
}

export interface IngestResponse {
  success: boolean;
  transcript_id: string;
  sitting_date: string;
  speakers: string[];
  topics: string[];
  segments_count: number;
  metadata: {
    total_words: number;
    processing_time_ms: number;
    cached: boolean;
    storage_urls?: {
      raw: string;
      processed: string;
    };
  };
  error?: string;
}

// ============================================================================
// Internal Processing Types
// ============================================================================

export interface ParsedSpeech {
  speaker: string;
  text: string;
  timestamp?: string;
  rawHTML: string;
}

export interface HTMLParseResult {
  speeches: ParsedSpeech[];
  timestamps: string[];
  speakers: string[];
}

export interface StorageMetadata {
  content_type: string;
  transcript_id: string;
  sitting_date: string;
  processed_at: string;
  version: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class HansardAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "HansardAPIError";
  }
}

export class HTMLParseError extends Error {
  constructor(
    message: string,
    public section?: string,
    public htmlSnippet?: string
  ) {
    super(message);
    this.name = "HTMLParseError";
  }
}

export class StorageError extends Error {
  constructor(
    message: string,
    public operation?: string,
    public path?: string
  ) {
    super(message);
    this.name = "StorageError";
  }
}

// ============================================================================
// Cloudflare Worker Environment Bindings
// ============================================================================

export interface Env {
  // R2 Bucket binding
  R2: R2Bucket;

  // Redis binding (Upstash)
  REDIS: KVNamespace;

  // Environment variables
  PARLIAMENT_API_BASE_URL?: string;
  CACHE_TTL_SECONDS?: string;
  MAX_RETRIES?: string;
  RETRY_DELAY_MS?: string;
}
