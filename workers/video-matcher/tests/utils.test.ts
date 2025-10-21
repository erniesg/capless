import { describe, it, expect } from 'vitest';
import {
  parseSittingDate,
  generateDateVariants,
  parseISO8601Duration,
  formatTimestamp,
  parseApproximateTime,
  extractTimestampsFromDescription,
  buildYouTubeURL,
  containsParliamentKeywords,
  extractSpeakerNames,
} from '../src/utils';

describe('parseSittingDate', () => {
  it('should parse valid DD-MM-YYYY format', () => {
    const result = parseSittingDate('02-07-2024');
    expect(result.day).toBe(2);
    expect(result.month).toBe(7);
    expect(result.year).toBe(2024);
    expect(result.iso).toBe('2024-07-02');
    expect(result.formatted).toBe('2 July 2024');
  });

  it('should parse single digit days and months', () => {
    const result = parseSittingDate('05-03-2024');
    expect(result.day).toBe(5);
    expect(result.month).toBe(3);
    expect(result.year).toBe(2024);
  });

  it('should throw error for invalid format', () => {
    expect(() => parseSittingDate('2024-07-02')).toThrow(); // Will throw "Date out of valid range" (year in day position)
    expect(() => parseSittingDate('02/07/2024')).toThrow('Invalid date format');
    expect(() => parseSittingDate('invalid')).toThrow('Invalid date format');
  });

  it('should throw error for invalid date components', () => {
    expect(() => parseSittingDate('32-07-2024')).toThrow('Date out of valid range');
    expect(() => parseSittingDate('02-13-2024')).toThrow('Date out of valid range');
    expect(() => parseSittingDate('02-07-1999')).toThrow('Date out of valid range');
  });

  it('should throw error for non-numeric values', () => {
    expect(() => parseSittingDate('aa-07-2024')).toThrow('Invalid date components');
  });
});

describe('generateDateVariants', () => {
  it('should generate multiple date format variants', () => {
    const variants = generateDateVariants('02-07-2024');
    expect(variants).toContain('2 July 2024');
    expect(variants).toContain('2 Jul 2024');
    expect(variants).toContain('July 2 2024');
    expect(variants).toContain('2024-07-02');
    expect(variants).toContain('2/7/2024');
  });

  it('should handle single-digit dates correctly', () => {
    const variants = generateDateVariants('05-03-2024');
    expect(variants).toContain('5 March 2024');
    expect(variants).toContain('5 Mar 2024');
    expect(variants).toContain('2024-03-05');
  });
});

describe('parseISO8601Duration', () => {
  it('should parse hours, minutes, and seconds', () => {
    expect(parseISO8601Duration('PT1H2M10S')).toBe(3730); // 1h 2m 10s
  });

  it('should parse hours and minutes only', () => {
    expect(parseISO8601Duration('PT1H30M')).toBe(5400); // 1h 30m
  });

  it('should parse minutes and seconds only', () => {
    expect(parseISO8601Duration('PT15M30S')).toBe(930); // 15m 30s
  });

  it('should parse seconds only', () => {
    expect(parseISO8601Duration('PT45S')).toBe(45);
  });

  it('should return 0 for invalid format', () => {
    expect(parseISO8601Duration('')).toBe(0);
    expect(parseISO8601Duration('invalid')).toBe(0);
    expect(parseISO8601Duration('1H2M')).toBe(0); // Missing PT prefix
  });

  it('should handle zero values', () => {
    expect(parseISO8601Duration('PT0H0M0S')).toBe(0);
  });
});

describe('formatTimestamp', () => {
  it('should format hours, minutes, and seconds', () => {
    expect(formatTimestamp(3661)).toBe('1:01:01'); // 1h 1m 1s
  });

  it('should format minutes and seconds without hours', () => {
    expect(formatTimestamp(125)).toBe('2:05'); // 2m 5s
  });

  it('should pad single digits correctly', () => {
    expect(formatTimestamp(65)).toBe('1:05'); // 1m 5s
    expect(formatTimestamp(3605)).toBe('1:00:05'); // 1h 0m 5s
  });

  it('should handle zero', () => {
    expect(formatTimestamp(0)).toBe('0:00');
  });
});

describe('parseApproximateTime', () => {
  it('should parse PM times correctly', () => {
    expect(parseApproximateTime('2:30 PM')).toBe(14 * 3600 + 30 * 60); // 2:30 PM
    expect(parseApproximateTime('12:00 PM')).toBe(12 * 3600); // 12:00 PM (noon)
  });

  it('should parse AM times correctly', () => {
    expect(parseApproximateTime('9:15 AM')).toBe(9 * 3600 + 15 * 60); // 9:15 AM
    expect(parseApproximateTime('12:00 AM')).toBe(0); // 12:00 AM (midnight)
  });

  it('should handle case-insensitive AM/PM', () => {
    expect(parseApproximateTime('3:45 pm')).toBe(15 * 3600 + 45 * 60);
    expect(parseApproximateTime('10:30 am')).toBe(10 * 3600 + 30 * 60);
  });

  it('should throw error for invalid format', () => {
    expect(() => parseApproximateTime('14:30')).toThrow('Invalid time format');
    expect(() => parseApproximateTime('2:30')).toThrow('Invalid time format');
    expect(() => parseApproximateTime('invalid')).toThrow('Invalid time format');
  });
});

describe('extractTimestampsFromDescription', () => {
  it('should extract timestamps with labels from description', () => {
    const description = `
00:00 Opening Remarks
12:34 Question on Healthcare
1:23:45 Minister's Response
[45:30] Discussion on Housing
    `.trim();

    const timestamps = extractTimestampsFromDescription(description);

    expect(timestamps).toHaveLength(4);
    expect(timestamps[0]).toEqual({
      timestamp: 0,
      label: 'Opening Remarks',
      raw: expect.any(String)
    });
    expect(timestamps[1]).toEqual({
      timestamp: 12 * 60 + 34,
      label: 'Question on Healthcare',
      raw: expect.any(String)
    });
    expect(timestamps[2]).toEqual({
      timestamp: 1 * 3600 + 23 * 60 + 45,
      label: "Minister's Response",
      raw: expect.any(String)
    });
    expect(timestamps[3]).toEqual({
      timestamp: 45 * 60 + 30,
      label: 'Discussion on Housing',
      raw: expect.any(String)
    });
  });

  it('should handle descriptions with no timestamps', () => {
    const description = 'This is a video about parliament with no timestamps';
    const timestamps = extractTimestampsFromDescription(description);
    expect(timestamps).toHaveLength(0);
  });

  it('should handle various timestamp formats', () => {
    const description = `
12:34 - First Topic
[56:78] Invalid (should be skipped)
1:23:45 - Long Topic
    `.trim();

    const timestamps = extractTimestampsFromDescription(description);
    expect(timestamps.length).toBeGreaterThan(0);
  });
});

describe('buildYouTubeURL', () => {
  it('should build URL without timestamp', () => {
    const url = buildYouTubeURL('dQw4w9WgXcQ');
    expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('should build URL with timestamp', () => {
    const url = buildYouTubeURL('dQw4w9WgXcQ', 125);
    expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s');
  });

  it('should handle zero timestamp', () => {
    const url = buildYouTubeURL('dQw4w9WgXcQ', 0);
    expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('should floor fractional timestamps', () => {
    const url = buildYouTubeURL('dQw4w9WgXcQ', 125.7);
    expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s');
  });
});

describe('containsParliamentKeywords', () => {
  it('should detect parliament-related keywords', () => {
    expect(containsParliamentKeywords('Singapore Parliament Session')).toBe(true);
    expect(containsParliamentKeywords('Parliamentary Sitting 2024')).toBe(true);
    expect(containsParliamentKeywords('Minister answers question')).toBe(true);
    expect(containsParliamentKeywords('Debate on new bill')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(containsParliamentKeywords('PARLIAMENT SESSION')).toBe(true);
    expect(containsParliamentKeywords('parliamentary debate')).toBe(true);
  });

  it('should return false for non-parliament content', () => {
    expect(containsParliamentKeywords('Random video title')).toBe(false);
    expect(containsParliamentKeywords('Cooking tutorial')).toBe(false);
  });
});

describe('extractSpeakerNames', () => {
  it('should extract speaker names with titles', () => {
    const text = 'Mr Yip Hon Weng asked about healthcare. Ms Rahayu Mahzam responded.';
    const speakers = extractSpeakerNames(text);

    expect(speakers).toContain('Mr Yip Hon Weng');
    expect(speakers).toContain('Ms Rahayu Mahzam');
  });

  it('should handle different titles', () => {
    const text = 'Dr Tan See Leng and Prof Chan Heng Chee spoke.';
    const speakers = extractSpeakerNames(text);

    expect(speakers).toContain('Dr Tan See Leng');
    expect(speakers).toContain('Prof Chan Heng Chee');
  });

  it('should remove duplicate speakers', () => {
    const text = 'Mr Yip Hon Weng spoke. Later, Mr Yip Hon Weng continued.';
    const speakers = extractSpeakerNames(text);

    expect(speakers).toHaveLength(1);
    expect(speakers[0]).toBe('Mr Yip Hon Weng');
  });

  it('should return empty array for no speakers', () => {
    const text = 'No speakers mentioned in this text.';
    const speakers = extractSpeakerNames(text);

    expect(speakers).toHaveLength(0);
  });
});
