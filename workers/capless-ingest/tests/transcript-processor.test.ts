/**
 * Tests for transcript processing logic
 */

import { describe, it, expect } from "vitest";
import { processHansardJSON, createTranscriptSegments, extractMetadata } from "../src/processors/transcript-processor";
import type { HansardJSON, ProcessedTranscript } from "../src/types";

describe("Transcript Processor", () => {
  const mockHansardJSON: HansardJSON = {
    metadata: {
      parlimentNO: 14,
      sessionNO: 3,
      volumeNO: 102,
      sittingDate: "02-07-2024",
      dateToDisplay: "Tuesday, 2 July 2024",
      startTimeStr: "1:30 pm",
      speaker: "Mr Speaker"
    },
    takesSectionVOList: [
      {
        startPgNo: 1,
        title: "Oral Answers to Questions",
        sectionType: "OA",
        questionCount: 3,
        content: `
          <h6>1.30 pm</h6>
          <p><strong>Mr Leong Mun Wai</strong>: To ask the Minister for National Development whether the Government will consider imposing a cooling-off period.</p>
          <p><strong>The Minister for National Development (Mr Desmond Lee)</strong>: Mr Speaker, the majority of Singaporeans live in HDB flats.</p>
        `
      },
      {
        startPgNo: 5,
        title: "Ministerial Statements",
        sectionType: "OS",
        questionCount: 0,
        content: `
          <h6>1.45 pm</h6>
          <p><strong>The Prime Minister (Mr Lawrence Wong)</strong>: Mr Speaker, I rise to make a statement on Singapore's economic strategy.</p>
        `
      }
    ],
    attendanceList: [
      { mpName: "Mr Leong Mun Wai", attendance: true },
      { mpName: "Mr Desmond Lee", attendance: true },
      { mpName: "Mr Lawrence Wong", attendance: true },
      { mpName: "Mr Gan Thiam Poh", attendance: false }
    ]
  };

  describe("extractMetadata", () => {
    it("should extract metadata from Hansard JSON", () => {
      const metadata = extractMetadata(mockHansardJSON);

      expect(metadata.parliament_no).toBe(14);
      expect(metadata.session_no).toBe(3);
      expect(metadata.volume_no).toBe(102);
      expect(metadata.start_time).toBe("1:30 pm");
      expect(metadata.speaker_of_parliament).toBe("Mr Speaker");
    });

    it("should extract attendance list", () => {
      const metadata = extractMetadata(mockHansardJSON);

      expect(metadata.attendance).toHaveLength(3);
      expect(metadata.attendance).toContain("Mr Leong Mun Wai");
      expect(metadata.attendance).toContain("Mr Desmond Lee");
      expect(metadata.attendance).toContain("Mr Lawrence Wong");
      expect(metadata.attendance).not.toContain("Mr Gan Thiam Poh"); // absent
    });

    it("should initialize total segments count to 0", () => {
      const metadata = extractMetadata(mockHansardJSON);

      // extractMetadata initializes to 0, updated later by processHansardJSON
      expect(metadata.total_segments).toBe(0);
    });

    it("should include processing timestamp", () => {
      const metadata = extractMetadata(mockHansardJSON);

      expect(metadata.processing_timestamp).toBeDefined();
      expect(new Date(metadata.processing_timestamp).getTime()).not.toBeNaN();
    });
  });

  describe("createTranscriptSegments", () => {
    it("should create segments from all sections", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");

      expect(segments.length).toBeGreaterThan(0);
    });

    it("should assign unique segment IDs", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");
      const ids = segments.map(s => s.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids).toEqual(uniqueIds);
    });

    it("should include segment metadata", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");

      segments.forEach((segment, index) => {
        expect(segment.id).toBe(`test-transcript-id-${index}`);
        expect(segment.speaker).toBeDefined();
        expect(segment.text).toBeDefined();
        expect(segment.section_title).toBeDefined();
        expect(segment.section_type).toMatch(/^(OS|OA|BILLS|PAPERS|OTHER)$/);
        expect(segment.page_number).toBeGreaterThanOrEqual(0);
        expect(segment.segment_index).toBe(index);
      });
    });

    it("should calculate word and character counts", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");

      segments.forEach(segment => {
        expect(segment.word_count).toBeGreaterThan(0);
        expect(segment.char_count).toBeGreaterThan(0);
        expect(segment.char_count).toBeGreaterThanOrEqual(segment.word_count); // chars >= words
      });
    });

    it("should preserve section information", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");

      const oaSegments = segments.filter(s => s.section_type === "OA");
      const osSegments = segments.filter(s => s.section_type === "OS");

      expect(oaSegments.length).toBeGreaterThan(0);
      expect(osSegments.length).toBeGreaterThan(0);

      oaSegments.forEach(s => {
        expect(s.section_title).toBe("Oral Answers to Questions");
      });

      osSegments.forEach(s => {
        expect(s.section_title).toBe("Ministerial Statements");
      });
    });

    it("should include timestamps where available", () => {
      const segments = createTranscriptSegments(mockHansardJSON, "test-transcript-id");

      const withTimestamp = segments.filter(s => s.timestamp);
      expect(withTimestamp.length).toBeGreaterThan(0);

      withTimestamp.forEach(s => {
        expect(s.timestamp).toMatch(/\d{1,2}\.\d{2}\s+(am|pm|noon)/);
      });
    });

    it("should handle sections with no content", () => {
      const emptyHansard: HansardJSON = {
        ...mockHansardJSON,
        takesSectionVOList: [
          {
            startPgNo: 1,
            title: "Empty Section",
            sectionType: "OTHER",
            content: ""
          }
        ]
      };

      const segments = createTranscriptSegments(emptyHansard, "test-id");
      expect(segments).toHaveLength(0);
    });
  });

  describe("processHansardJSON", () => {
    it("should process Hansard JSON into ProcessedTranscript", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result).toBeDefined();
      expect(result.transcript_id).toBeDefined();
      expect(result.sitting_date).toBe("2024-07-02");
      expect(result.date_display).toBe("Tuesday, 2 July 2024");
    });

    it("should extract unique speakers list", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result.speakers).toContain("Mr Leong Mun Wai");
      expect(result.speakers).toContain("The Minister for National Development (Mr Desmond Lee)");
      expect(result.speakers).toContain("The Prime Minister (Mr Lawrence Wong)");

      // Should be unique
      const uniqueSpeakers = [...new Set(result.speakers)];
      expect(result.speakers).toEqual(uniqueSpeakers);
    });

    it("should extract unique topics list", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result.topics).toContain("Oral Answers to Questions");
      expect(result.topics).toContain("Ministerial Statements");

      // Should be unique
      const uniqueTopics = [...new Set(result.topics)];
      expect(result.topics).toEqual(uniqueTopics);
    });

    it("should include all segments", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.metadata.total_segments).toBe(result.segments.length);
    });

    it("should calculate total words", () => {
      const result = processHansardJSON(mockHansardJSON);

      const totalWords = result.segments.reduce((sum, s) => sum + s.word_count, 0);
      expect(result.metadata.total_words).toBe(totalWords);
    });

    it("should use custom transcript ID if provided", () => {
      const customId = "custom-transcript-2024";
      const result = processHansardJSON(mockHansardJSON, customId);

      expect(result.transcript_id).toBe(customId);
      result.segments.forEach((segment, index) => {
        expect(segment.id).toBe(`${customId}-${index}`);
      });
    });

    it("should generate transcript ID from sitting date if not provided", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result.transcript_id).toContain("2024-07-02");
    });

    it("should include complete metadata", () => {
      const result = processHansardJSON(mockHansardJSON);

      expect(result.metadata).toMatchObject({
        parliament_no: 14,
        session_no: 3,
        volume_no: 102,
        start_time: "1:30 pm",
        speaker_of_parliament: "Mr Speaker"
      });

      expect(result.metadata.attendance.length).toBeGreaterThan(0);
      expect(result.metadata.processing_timestamp).toBeDefined();
    });

    it("should handle Hansard with single section", () => {
      const singleSectionHansard: HansardJSON = {
        ...mockHansardJSON,
        takesSectionVOList: [mockHansardJSON.takesSectionVOList[0]]
      };

      const result = processHansardJSON(singleSectionHansard);

      expect(result.topics).toHaveLength(1);
      expect(result.segments.length).toBeGreaterThan(0);
    });

    it("should handle Hansard with no attendance list", () => {
      const noAttendanceHansard: HansardJSON = {
        ...mockHansardJSON,
        attendanceList: []
      };

      const result = processHansardJSON(noAttendanceHansard);

      expect(result.metadata.attendance).toHaveLength(0);
    });
  });
});
