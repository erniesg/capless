/**
 * Tests for HTML parsing and extraction logic
 */

import { describe, it, expect } from "vitest";
import { parseHansardHTML, extractSpeaker, extractTimestamp, cleanText } from "../src/parsers/html-parser";

describe("HTML Parser", () => {
  describe("extractSpeaker", () => {
    it("should extract speaker from <strong> tag", () => {
      const html = "<p><strong>Mr Leong Mun Wai</strong>: To ask the Minister...</p>";
      const speaker = extractSpeaker(html);
      expect(speaker).toBe("Mr Leong Mun Wai");
    });

    it("should handle speaker with title", () => {
      const html = "<p><strong>The Prime Minister (Mr Lawrence Wong)</strong>: Mr Speaker...</p>";
      const speaker = extractSpeaker(html);
      expect(speaker).toBe("The Prime Minister (Mr Lawrence Wong)");
    });

    it("should return null for paragraphs without speaker", () => {
      const html = "<p>This is a continuation of the previous speech.</p>";
      const speaker = extractSpeaker(html);
      expect(speaker).toBeNull();
    });

    it("should handle multiple <strong> tags and return first", () => {
      const html = "<p><strong>Mr Speaker</strong>: I thank <strong>the Minister</strong>.</p>";
      const speaker = extractSpeaker(html);
      expect(speaker).toBe("Mr Speaker");
    });
  });

  describe("extractTimestamp", () => {
    it("should extract timestamp from <h6> tag", () => {
      const html = "<h6>1.30 pm</h6>";
      const timestamp = extractTimestamp(html);
      expect(timestamp).toBe("1.30 pm");
    });

    it("should handle noon format", () => {
      const html = "<h6>12.00 noon</h6>";
      const timestamp = extractTimestamp(html);
      expect(timestamp).toBe("12.00 noon");
    });

    it("should handle am format", () => {
      const html = "<h6>9.15 am</h6>";
      const timestamp = extractTimestamp(html);
      expect(timestamp).toBe("9.15 am");
    });

    it("should return null for non-timestamp h6 tags", () => {
      const html = "<h6>Section Title</h6>";
      const timestamp = extractTimestamp(html);
      expect(timestamp).toBeNull();
    });
  });

  describe("cleanText", () => {
    it("should strip HTML tags", () => {
      const html = "<p>This is <strong>bold</strong> text.</p>";
      const clean = cleanText(html);
      expect(clean).toBe("This is bold text.");
    });

    it("should normalize whitespace", () => {
      const html = "<p>Multiple    spaces   and\n\nnewlines</p>";
      const clean = cleanText(html);
      expect(clean).toBe("Multiple spaces and newlines");
    });

    it("should handle nested tags", () => {
      const html = "<p><strong>Mr Speaker</strong>: I <em>thank</em> the <a href='#'>Minister</a>.</p>";
      const clean = cleanText(html);
      expect(clean).toBe("Mr Speaker: I thank the Minister.");
    });

    it("should preserve colons after speaker names", () => {
      const html = "<strong>Mr Leong Mun Wai</strong>: To ask the Minister";
      const clean = cleanText(html);
      expect(clean).toBe("Mr Leong Mun Wai: To ask the Minister");
    });

    it("should handle empty input", () => {
      const clean = cleanText("");
      expect(clean).toBe("");
    });
  });

  describe("parseHansardHTML", () => {
    const sampleHTML = `
      <h6>1.30 pm</h6>
      <p><strong>Mr Leong Mun Wai</strong>: To ask the Minister for National Development whether the Government will consider imposing a cooling-off period.</p>
      <p><strong>The Minister for National Development (Mr Desmond Lee)</strong>: Mr Speaker, the majority of Singaporeans live in HDB flats.</p>
      <h6>1.32 pm</h6>
      <p><strong>Mr Leong Mun Wai</strong>: Sir, I thank the Minister for his answer but I would like to ask a supplementary question.</p>
      <p>This is a continuation without a speaker tag.</p>
      <p><strong>Mr Desmond Lee</strong>: Mr Speaker, I thank the Member for his supplementary question.</p>
    `;

    it("should parse HTML into speech segments", () => {
      const result = parseHansardHTML(sampleHTML);

      expect(result.speeches).toHaveLength(4);
      expect(result.speakers).toContain("Mr Leong Mun Wai");
      expect(result.speakers).toContain("The Minister for National Development (Mr Desmond Lee)");
      expect(result.speakers).toContain("Mr Desmond Lee");
    });

    it("should extract all timestamps", () => {
      const result = parseHansardHTML(sampleHTML);

      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps).toContain("1.30 pm");
      expect(result.timestamps).toContain("1.32 pm");
    });

    it("should associate timestamps with speeches", () => {
      const result = parseHansardHTML(sampleHTML);

      expect(result.speeches[0].timestamp).toBe("1.30 pm");
      expect(result.speeches[1].timestamp).toBe("1.30 pm");
      expect(result.speeches[2].timestamp).toBe("1.32 pm");
    });

    it("should merge continuation paragraphs with previous speech", () => {
      const result = parseHansardHTML(sampleHTML);

      const leongSecondSpeech = result.speeches.find(
        s => s.speaker === "Mr Leong Mun Wai" && s.timestamp === "1.32 pm"
      );

      expect(leongSecondSpeech?.text).toContain("Sir, I thank the Minister");
      expect(leongSecondSpeech?.text).toContain("This is a continuation without a speaker tag");
    });

    it("should clean text in all speeches", () => {
      const result = parseHansardHTML(sampleHTML);

      result.speeches.forEach(speech => {
        expect(speech.text).not.toMatch(/<[^>]+>/); // No HTML tags
        expect(speech.text.length).toBeGreaterThan(0);
      });
    });

    it("should return unique speakers list", () => {
      const result = parseHansardHTML(sampleHTML);

      const uniqueSpeakers = [...new Set(result.speakers)];
      expect(result.speakers).toEqual(uniqueSpeakers);
    });

    it("should handle empty HTML", () => {
      const result = parseHansardHTML("");

      expect(result.speeches).toHaveLength(0);
      expect(result.timestamps).toHaveLength(0);
      expect(result.speakers).toHaveLength(0);
    });

    it("should handle HTML with only timestamps", () => {
      const html = "<h6>1.30 pm</h6><h6>2.00 pm</h6>";
      const result = parseHansardHTML(html);

      expect(result.timestamps).toHaveLength(2);
      expect(result.speeches).toHaveLength(0);
    });

    it("should handle HTML with only speeches (no timestamps)", () => {
      const html = "<p><strong>Mr Speaker</strong>: Thank you.</p>";
      const result = parseHansardHTML(html);

      expect(result.speeches).toHaveLength(1);
      expect(result.speeches[0].timestamp).toBeUndefined();
    });
  });
});
