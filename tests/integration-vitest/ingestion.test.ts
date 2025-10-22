/**
 * Integration tests for Capless Ingestion Worker
 * Uses Vitest + @cloudflare/vitest-pool-workers
 */

import { describe, it, expect, beforeAll } from "vitest";
import { fetchMock, env, SELF } from "cloudflare:test";

describe("Ingestion Worker Integration Tests", () => {
  beforeAll(() => {
    // Enable fetch mocking globally
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  describe("POST /api/ingest/hansard - Happy Path", () => {
    it("should ingest Hansard by sitting date", async () => {
      // Mock Parliament API response with correct structure
      const mockHansardJSON = {
        metadata: {
          parlimentNO: 15,
          sessionNO: 1,
          volumeNO: 1,
          sittingDate: "02-07-2024",
          dateToDisplay: "Tuesday, 2 July 2024",
          startTimeStr: "12:00 noon",
          speaker: "Speaker of Parliament",
        },
        takesSectionVOList: [
          {
            startPgNo: 1,
            title: "Oral Answers to Questions",
            sectionType: "OA",
            content:
              '<p><strong>Leader of Opposition</strong>: Mr Speaker, I rise to ask about the budget.</p>',
          },
        ],
        attendanceList: [
          {
            mpName: "Leader of Opposition",
            attendance: true,
          },
        ],
      };

      // Mock the exact fetch URL constructed by the worker
      // The URL will be: https://sprs.parl.gov.sg/search/getHansardReport/?sittingDate=02-07-2024
      fetchMock
        .get("https://sprs.parl.gov.sg")
        .intercept({ path: (path) => path.includes("/search/getHansardReport/") })
        .reply(200, JSON.stringify(mockHansardJSON));

      // Make request to worker
      const response = await SELF.fetch("http://localhost/api/ingest/hansard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sittingDate: "02-07-2024",
          skipStorage: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.sitting_date).toBe("2024-07-02");
      expect(body.segments_count).toBeGreaterThan(0);
    });

    it("should ingest with pre-fetched Hansard JSON", async () => {
      const hansardJSON = {
        metadata: {
          parlimentNO: 15,
          sessionNO: 1,
          volumeNO: 1,
          sittingDate: "02-07-2024",
          dateToDisplay: "Tuesday, 2 July 2024",
          startTimeStr: "12:00 noon",
          speaker: "Speaker of Parliament",
        },
        takesSectionVOList: [
          {
            startPgNo: 1,
            title: "Bills - First Reading",
            sectionType: "BILLS",
            content:
              '<p><strong>Minister for Finance</strong>: I beg to move the first reading of the Finance Bill.</p>',
          },
        ],
        attendanceList: [
          {
            mpName: "Minister for Finance",
            attendance: true,
          },
        ],
      };

      const response = await SELF.fetch("http://localhost/api/ingest/hansard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hansardJSON,
          skipStorage: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.sitting_date).toBe("2024-07-02");
      expect(body.speakers).toContain("Minister for Finance");
    });
  });

  describe("POST /api/ingest/hansard - Error Handling", () => {
    it("should handle missing parameters", async () => {
      const response = await SELF.fetch("http://localhost/api/ingest/hansard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.success).toBe(false);
      expect(body.error).toContain("Missing required field");
    });

    it("should handle invalid sitting date format", async () => {
      const response = await SELF.fetch("http://localhost/api/ingest/hansard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sittingDate: "invalid-date",
          skipStorage: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();

      expect(body.success).toBe(false);
    });
  });

  describe("GET /health", () => {
    it("should return healthy status", async () => {
      const response = await SELF.fetch("http://localhost/health");

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.status).toBe("ok");
      expect(body.service).toBe("capless-ingest");
      expect(body.timestamp).toBeTruthy();
    });
  });
});
