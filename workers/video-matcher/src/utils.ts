/**
 * Utility functions for date parsing, formatting, and validation
 */

/**
 * Parse Singapore date format (DD-MM-YYYY) to ISO date components
 * @param dateString - Date in DD-MM-YYYY format (e.g., "02-07-2024")
 * @returns Object with year, month, day, and ISO string
 */
export function parseSittingDate(dateString: string): {
  year: number;
  month: number;
  day: number;
  iso: string;
  formatted: string;
} {
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateString}. Expected DD-MM-YYYY`);
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    throw new Error(`Invalid date components in: ${dateString}`);
  }

  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) {
    throw new Error(`Date out of valid range: ${dateString}`);
  }

  // Create ISO string for the date (use UTC to avoid timezone issues)
  const iso = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  // Format for display (e.g., "2 July 2024")
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const formatted = `${day} ${monthNames[month - 1]} ${year}`;

  return { year, month, day, iso, formatted };
}

/**
 * Generate search-friendly date variants for YouTube search
 * @param dateString - Date in DD-MM-YYYY format
 * @returns Array of search query variants
 */
export function generateDateVariants(dateString: string): string[] {
  const parsed = parseSittingDate(dateString);
  const { day, month, year, formatted } = parsed;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return [
    formatted, // "2 July 2024"
    `${day} ${monthShort[month - 1]} ${year}`, // "2 Jul 2024"
    `${monthNames[month - 1]} ${day} ${year}`, // "July 2 2024"
    `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, // "2024-07-02"
    `${day}/${month}/${year}`, // "2/7/2024"
  ];
}

/**
 * Parse ISO 8601 duration to seconds
 * @param duration - ISO 8601 duration string (e.g., "PT1H2M10S")
 * @returns Duration in seconds
 */
export function parseISO8601Duration(duration: string): number {
  if (!duration || !duration.startsWith('PT')) {
    return 0;
  }

  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) {
    return 0;
  }

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to YouTube timestamp (HH:MM:SS or MM:SS)
 * @param seconds - Total seconds
 * @returns Formatted timestamp string
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse time string to seconds from start of day
 * @param timeString - Time in "HH:MM AM/PM" format (e.g., "2:30 PM")
 * @returns Seconds from midnight
 */
export function parseApproximateTime(timeString: string): number {
  const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) {
    throw new Error(`Invalid time format: ${timeString}. Expected "HH:MM AM/PM"`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 3600 + minutes * 60;
}

/**
 * Extract timestamps from YouTube video description
 * Looks for patterns like "12:34 - Topic name" or "1:23:45 Topic"
 * @param description - Video description text
 * @returns Array of { timestamp: seconds, label: string }
 */
export function extractTimestampsFromDescription(description: string): Array<{
  timestamp: number;
  label: string;
  raw: string;
}> {
  const timestamps: Array<{ timestamp: number; label: string; raw: string }> = [];

  // Match patterns like:
  // "12:34 - Topic name"
  // "1:23:45 Topic name"
  // "[12:34] Topic name"
  const pattern = /(?:\[)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\])?[\s-]+(.*?)(?:\n|$)/g;

  let match;
  while ((match = pattern.exec(description)) !== null) {
    const hours = match[3] ? parseInt(match[1], 10) : 0;
    const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10);

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const label = match[4].trim();

    if (label) {
      timestamps.push({
        timestamp: totalSeconds,
        label,
        raw: match[0].trim()
      });
    }
  }

  return timestamps;
}

/**
 * Build YouTube video URL with timestamp
 * @param videoId - YouTube video ID
 * @param timestampSeconds - Start time in seconds
 * @returns Full YouTube URL with timestamp
 */
export function buildYouTubeURL(videoId: string, timestampSeconds?: number): string {
  const baseUrl = `https://www.youtube.com/watch?v=${videoId}`;
  if (timestampSeconds && timestampSeconds > 0) {
    return `${baseUrl}&t=${Math.floor(timestampSeconds)}s`;
  }
  return baseUrl;
}

/**
 * Check if a string contains parliamentary keywords
 * @param text - Text to search
 * @returns True if contains relevant keywords
 */
export function containsParliamentKeywords(text: string): boolean {
  const keywords = [
    'parliament',
    'parliamentary',
    'sitting',
    'session',
    'debate',
    'minister',
    'mp',
    'question',
    'bill',
    'motion',
    'singapore'
  ];

  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Extract speaker names from text
 * Common Singapore Parliament formats:
 * - "Mr Yip Hon Weng"
 * - "Ms Rahayu Mahzam"
 * - "Dr Tan See Leng"
 * @param text - Text to search
 * @returns Array of detected speaker names
 */
export function extractSpeakerNames(text: string): string[] {
  const pattern = /(Mr|Ms|Mrs|Dr|Prof)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const speakers: string[] = [];

  let match;
  while ((match = pattern.exec(text)) !== null) {
    speakers.push(match[0]);
  }

  return [...new Set(speakers)]; // Remove duplicates
}
