/**
 * Tests for Hansard API client
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchHansardJSON, normalizeSittingDate, generateTranscriptId } from "../src/clients/hansard-api";
import { HansardAPIError } from "../src/types";

// Mock fetch globally
global.fetch = vi.fn();

describe("Hansard API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeSittingDate", () => {
    it("should convert DD-MM-YYYY to YYYY-MM-DD", () => {
      const normalized = normalizeSittingDate("02-07-2024");
      expect(normalized).toBe("2024-07-02");
    });

    it("should pass through YYYY-MM-DD unchanged", () => {
      const normalized = normalizeSittingDate("2024-07-02");
      expect(normalized).toBe("2024-07-02");
    });

    it("should handle single-digit days and months", () => {
      const normalized = normalizeSittingDate("2-7-2024");
      expect(normalized).toBe("2024-07-02");
    });

    it("should throw error for invalid date format", () => {
      expect(() => normalizeSittingDate("invalid-date")).toThrow();
      expect(() => normalizeSittingDate("2024/07/02")).toThrow();
    });
  });

  describe("generateTranscriptId", () => {
    it("should generate ID in correct format", () => {
      const id = generateTranscriptId("2024-07-02", 1);
      expect(id).toBe("2024-07-02-sitting-1");
    });

    it("should handle parliament number", () => {
      const id = generateTranscriptId("2024-07-02", 14, 3);
      expect(id).toBe("2024-07-02-p14-s3");
    });

    it("should default to sitting-1 if no parliament/session provided", () => {
      const id = generateTranscriptId("2024-07-02");
      expect(id).toBe("2024-07-02-sitting-1");
    });
  });

  describe("fetchHansardJSON", () => {
    const mockHansardResponse = {
      metadata: {
        parlimentNO: 14,
        sessionNO: 3,
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
          content: "<p><strong>Speaker</strong>: Content</p>"
        }
      ],
      attendanceList: [
        { mpName: "Mr Speaker", attendance: true }
      ]
    };

    it("should fetch Hansard JSON successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHansardResponse
      });

      const result = await fetchHansardJSON("02-07-2024");

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("sittingDate=02-07-2024"),
        expect.any(Object)
      );
      expect(result).toEqual(mockHansardResponse);
    });

    it("should use custom base URL if provided", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHansardResponse
      });

      const customBaseUrl = "https://custom.parliament.gov.sg";
      await fetchHansardJSON("02-07-2024", { baseUrl: customBaseUrl });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(customBaseUrl),
        expect.any(Object)
      );
    });

    it("should include timeout in fetch options", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHansardResponse
      });

      await fetchHansardJSON("02-07-2024", { timeout: 5000 });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    it("should throw HansardAPIError on 404", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Not Found"
      });

      await expect(fetchHansardJSON("99-99-9999")).rejects.toThrow(HansardAPIError);
    });

    it("should throw HansardAPIError on 500", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Internal Server Error"
      });

      await expect(
        fetchHansardJSON("02-07-2024", { maxRetries: 0, retryDelay: 0 })
      ).rejects.toThrow(HansardAPIError);
    });

    it("should retry on network errors", async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHansardResponse
        });

      const result = await fetchHansardJSON("02-07-2024", { maxRetries: 3, retryDelay: 10 });

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockHansardResponse);
    });

    it("should throw after max retries exhausted", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      await expect(
        fetchHansardJSON("02-07-2024", { maxRetries: 2, retryDelay: 10 })
      ).rejects.toThrow(/Network error/);

      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should handle invalid JSON response", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        text: async () => "invalid json"
      });

      await expect(
        fetchHansardJSON("02-07-2024", { maxRetries: 0 })
      ).rejects.toThrow();
    });

    it("should validate response structure", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}), // Missing required fields
        text: async () => "{}"
      });

      await expect(
        fetchHansardJSON("02-07-2024", { maxRetries: 0 })
      ).rejects.toThrow(/Invalid Hansard response/);
    });
  });
});
