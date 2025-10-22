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
      // Mock Parliament API response
      const mockHansardJSON = {
        metadata: {
          sittingDate: "02-07-2024",
          sittingNo: 1,
          parliamentNo: 15,
          volumeNo: 1,
        },
        sections: [
          {
            title: "Oral Answers to Questions",
            type: "oral-answers",
            content: [
              {
                speaker: "Leader of Opposition",
                speech: "Mr Speaker, I rise to ask about the budget.",
                timestamp: "14:30:00",
              },
            ],
          },
        ],
      };

      fetchMock
        .get("https://sprs.parl.gov.sg")
        .intercept({
          path: "/search/getHansardReport/",
          query: { sittingDate: "02-07-2024" },
        })
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
          sittingDate: "02-07-2024",
          sittingNo: 1,
          parliamentNo: 15,
          volumeNo: 1,
        },
        sections: [
          {
            title: "Bills - First Reading",
            type: "bills",
            content: [
              {
                speaker: "Minister for Finance",
                speech: "I beg to move the first reading of the Finance Bill.",
                timestamp: "15:00:00",
              },
            ],
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
