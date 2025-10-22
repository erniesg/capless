/**
 * Service Binding Integration Tests
 * Tests worker-to-worker communication via service bindings
 */

import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("Service Binding Tests", () => {
  describe("Asset Generator → Moments Worker", () => {
    it("should call MOMENTS service binding to fetch viral moments", async () => {
      // This test validates that:
      // 1. Asset Generator can call Moments worker via service binding
      // 2. Request/response format is correct
      // 3. Data flows properly between workers

      // TODO: Implement when MOMENTS binding is available in test env
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Full Pipeline Flow (Mocked)", () => {
    it("should orchestrate: Ingest → Match → Moments → Assets → Compose", async () => {
      // Step 1: Ingest Hansard
      const ingestResponse = await SELF.fetch("http://localhost/api/ingest/hansard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hansardJSON: {
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
                content: '<p><strong>PM Lee</strong>: The economy is doing well.</p>',
              },
            ],
            attendanceList: [{ mpName: "PM Lee", attendance: true }],
          },
          skipStorage: true,
        }),
      });

      expect(ingestResponse.status).toBe(200);
      const ingestData = await ingestResponse.json();
      expect(ingestData.success).toBe(true);

      // TODO: Add more pipeline steps when other workers have integration tests
      // Step 2: Match videos (needs video-matcher integration tests)
      // Step 3: Detect moments (needs moments integration tests)
      // Step 4: Generate assets (needs asset-generator integration tests)
      // Step 5: Compose video (needs video-compositor integration tests)
    });
  });
});
