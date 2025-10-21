/**
 * HTML parser for Singapore Parliament Hansard content
 * Extracts speakers, timestamps, and speeches from HTML sections
 */

import * as cheerio from "cheerio";
import type { HTMLParseResult, ParsedSpeech } from "../types";

/**
 * Extract speaker name from HTML paragraph
 * Speakers are typically in <strong> tags followed by a colon
 */
export function extractSpeaker(html: string): string | null {
  const $ = cheerio.load(html);
  const strongTag = $("strong").first();

  if (strongTag.length === 0) {
    return null;
  }

  const speakerText = strongTag.text().trim();

  // Validate it looks like a speaker (has text and often followed by colon)
  if (speakerText.length === 0) {
    return null;
  }

  return speakerText;
}

/**
 * Extract timestamp from HTML heading
 * Timestamps are in <h6> tags like "1.30 pm", "12.00 noon"
 */
export function extractTimestamp(html: string): string | null {
  const $ = cheerio.load(html);
  const h6Text = $("h6").first().text().trim();

  if (!h6Text) {
    return null;
  }

  // Match time patterns: "1.30 pm", "12.00 noon", "9.15 am"
  const timePattern = /^\d{1,2}\.\d{2}\s+(am|pm|noon)$/i;

  if (timePattern.test(h6Text)) {
    return h6Text;
  }

  return null;
}

/**
 * Clean HTML text by stripping tags and normalizing whitespace
 */
export function cleanText(html: string): string {
  const $ = cheerio.load(html);

  // Extract text content
  let text = $.text();

  // Normalize whitespace: replace multiple spaces/newlines with single space
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Parse Hansard HTML section into structured speeches
 */
export function parseHansardHTML(html: string): HTMLParseResult {
  if (!html || html.trim().length === 0) {
    return {
      speeches: [],
      timestamps: [],
      speakers: []
    };
  }

  const $ = cheerio.load(html);
  const speeches: ParsedSpeech[] = [];
  const timestamps: string[] = [];
  const speakersSet = new Set<string>();

  let currentTimestamp: string | undefined = undefined;
  let currentSpeech: ParsedSpeech | null = null;

  // Process each top-level element (h6, p tags)
  $("body")
    .children()
    .each((_, element) => {
      const $el = $(element);
      const tagName = element.tagName.toLowerCase();

      if (tagName === "h6") {
        // Extract timestamp
        const timestamp = extractTimestamp($.html($el));
        if (timestamp) {
          currentTimestamp = timestamp;
          timestamps.push(timestamp);
        }
      } else if (tagName === "p") {
        // Extract speaker from this paragraph
        const speaker = extractSpeaker($.html($el));
        const text = cleanText($.html($el));

        if (!text) {
          return; // Skip empty paragraphs
        }

        if (speaker) {
          // New speech starting
          if (currentSpeech) {
            speeches.push(currentSpeech);
          }

          currentSpeech = {
            speaker,
            text,
            timestamp: currentTimestamp,
            rawHTML: $.html($el)
          };

          speakersSet.add(speaker);
        } else if (currentSpeech) {
          // Continuation of previous speech (no speaker tag)
          currentSpeech.text += " " + text;
          currentSpeech.rawHTML += "\n" + $.html($el);
        }
        // If no speaker and no current speech, skip (orphaned paragraph)
      }
    });

  // Add the last speech if exists
  if (currentSpeech) {
    speeches.push(currentSpeech);
  }

  return {
    speeches,
    timestamps,
    speakers: Array.from(speakersSet)
  };
}
