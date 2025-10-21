/**
 * Client for fetching Hansard data from Singapore Parliament API
 */

import { HansardAPIError, type HansardJSON } from "../types";

const DEFAULT_BASE_URL = "https://sprs.parl.gov.sg/search";
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

interface FetchOptions {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Normalize sitting date to YYYY-MM-DD format
 * Input can be "DD-MM-YYYY" or "YYYY-MM-DD"
 */
export function normalizeSittingDate(sittingDate: string): string {
  // Remove any whitespace
  const cleaned = sittingDate.trim();

  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    // Pad single digits
    const [year, month, day] = cleaned.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Check if in DD-MM-YYYY format
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  throw new Error(
    `Invalid date format: ${sittingDate}. Expected DD-MM-YYYY or YYYY-MM-DD`
  );
}

/**
 * Convert YYYY-MM-DD to DD-MM-YYYY for API request
 */
export function formatDateForAPI(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/**
 * Generate transcript ID from sitting date and metadata
 */
export function generateTranscriptId(
  sittingDate: string,
  parliamentNo?: number,
  sessionNo?: number
): string {
  const normalized = normalizeSittingDate(sittingDate);

  if (parliamentNo && sessionNo) {
    return `${normalized}-p${parliamentNo}-s${sessionNo}`;
  }

  return `${normalized}-sitting-1`;
}

/**
 * Validate Hansard JSON response structure
 */
function validateHansardResponse(data: any): asserts data is HansardJSON {
  if (!data || typeof data !== "object") {
    throw new HansardAPIError("Invalid Hansard response: not an object");
  }

  if (!data.metadata || typeof data.metadata !== "object") {
    throw new HansardAPIError("Invalid Hansard response: missing metadata");
  }

  if (!Array.isArray(data.takesSectionVOList)) {
    throw new HansardAPIError(
      "Invalid Hansard response: missing or invalid takesSectionVOList"
    );
  }

  if (!Array.isArray(data.attendanceList)) {
    throw new HansardAPIError(
      "Invalid Hansard response: missing or invalid attendanceList"
    );
  }

  // Validate required metadata fields
  const { metadata } = data;
  if (
    typeof metadata.parlimentNO !== "number" ||
    typeof metadata.sessionNO !== "number" ||
    typeof metadata.sittingDate !== "string" ||
    typeof metadata.dateToDisplay !== "string"
  ) {
    throw new HansardAPIError("Invalid Hansard response: incomplete metadata");
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch Hansard JSON from Singapore Parliament API with retry logic
 */
export async function fetchHansardJSON(
  sittingDate: string,
  options: FetchOptions = {}
): Promise<HansardJSON> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
  } = options;

  // Normalize and format date
  const normalizedDate = normalizeSittingDate(sittingDate);
  const apiDate = formatDateForAPI(normalizedDate);

  // Construct API URL
  const url = `${baseUrl}/getHansardReport/?sittingDate=${apiDate}`;

  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Capless-Ingest/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check response status
      if (!response.ok) {
        throw new HansardAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      // Parse JSON
      const data = await response.json();

      // Validate structure
      validateHansardResponse(data);

      return data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors or 4xx errors
      if (error instanceof HansardAPIError) {
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error; // Client errors are not retryable
        }
      }

      // If not last attempt, wait and retry
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await sleep(delay);
        continue;
      }

      // Last attempt failed, throw error
      throw new HansardAPIError(
        `Failed to fetch Hansard JSON after ${maxRetries + 1} attempts: ${lastError.message}`,
        undefined,
        lastError.message
      );
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError!;
}

/**
 * Fetch Hansard JSON from custom URL
 */
export async function fetchHansardFromURL(
  url: string,
  options: FetchOptions = {}
): Promise<HansardJSON> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new HansardAPIError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();
    validateHansardResponse(data);

    return data;
  } catch (error) {
    if (error instanceof HansardAPIError) {
      throw error;
    }

    throw new HansardAPIError(
      `Failed to fetch Hansard from URL: ${(error as Error).message}`
    );
  }
}
