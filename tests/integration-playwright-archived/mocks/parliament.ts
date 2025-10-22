/**
 * Mock factory for Singapore Parliament API responses
 * Matches the actual Parliament Hansard API schema
 */

import { z } from 'zod';

// ============================================================================
// Parliament API Response Schemas
// ============================================================================

export const HansardMetadataSchema = z.object({
  parlimentNO: z.number(),
  sessionNO: z.number(),
  volumeNO: z.number().optional(),
  sittingDate: z.string(), // "02-07-2024"
  dateToDisplay: z.string(), // "Tuesday, 2 July 2024"
  startTimeStr: z.string(), // "12:00 noon"
  speaker: z.string(), // Speaker of Parliament
});

export const TakesSectionSchema = z.object({
  startPgNo: z.number(),
  title: z.string(),
  sectionType: z.enum(['OS', 'OA', 'BILLS', 'PAPERS', 'OTHER']),
  content: z.string(), // HTML content
  questionCount: z.number().optional(),
});

export const AttendanceRecordSchema = z.object({
  mpName: z.string(),
  attendance: z.boolean(),
});

export const HansardJSONSchema = z.object({
  metadata: HansardMetadataSchema,
  takesSectionVOList: z.array(TakesSectionSchema),
  attendanceList: z.array(AttendanceRecordSchema),
});

export type HansardJSON = z.infer<typeof HansardJSONSchema>;
export type HansardMetadata = z.infer<typeof HansardMetadataSchema>;
export type TakesSection = z.infer<typeof TakesSectionSchema>;
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock Hansard JSON response
 */
export function createHansardResponse(options?: {
  date?: string;
  parliamentNo?: number;
  sessionNo?: number;
  sections?: Partial<TakesSection>[];
  attendance?: string[];
}): HansardJSON {
  const date = options?.date ?? '02-07-2024';
  const parliamentNo = options?.parliamentNo ?? 15;
  const sessionNo = options?.sessionNo ?? 1;

  return {
    metadata: {
      parlimentNO: parliamentNo,
      sessionNO: sessionNo,
      volumeNO: 1,
      sittingDate: date,
      dateToDisplay: formatDisplayDate(date),
      startTimeStr: '12:00 noon',
      speaker: 'Speaker Tan Chuan-Jin',
    },
    takesSectionVOList: options?.sections?.map((section, index) => ({
      startPgNo: section.startPgNo ?? index + 1,
      title: section.title ?? `Section ${index + 1}`,
      sectionType: section.sectionType ?? 'OA',
      content: section.content ?? '<p>Sample content</p>',
      questionCount: section.questionCount,
    })) ?? DEFAULT_SECTIONS,
    attendanceList: (options?.attendance ?? DEFAULT_MPS).map(mpName => ({
      mpName,
      attendance: true,
    })),
  };
}

/**
 * Create a mock Hansard API error response
 */
export function createParliamentErrorResponse(
  message: string,
  status: number = 404
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status: 'error',
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create realistic parliamentary HTML content
 */
export function createParliamentaryHTML(speeches: Array<{
  speaker: string;
  text: string;
  timestamp?: string;
}>): string {
  let html = '<div class="parliamentary-content">';

  for (const speech of speeches) {
    html += `
      <div class="speech">
        ${speech.timestamp ? `<p class="timestamp">${speech.timestamp}</p>` : ''}
        <p class="speaker"><strong>${speech.speaker}:</strong></p>
        <p class="speech-text">${speech.text}</p>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

// ============================================================================
// Fixture Data
// ============================================================================

/**
 * Default MPs for attendance
 */
export const DEFAULT_MPS = [
  'Prime Minister Lee Hsien Loong',
  'Deputy Prime Minister Lawrence Wong',
  'Minister for Finance',
  'Minister for Home Affairs',
  'Leader of Opposition Pritam Singh',
  'Ms Sylvia Lim',
  'Mr Leong Mun Wai',
  'Dr Tan Cheng Bock',
];

/**
 * Sample parliamentary sections with realistic content
 */
export const DEFAULT_SECTIONS: TakesSection[] = [
  {
    startPgNo: 1,
    title: 'Oral Answers to Questions',
    sectionType: 'OA',
    content: createParliamentaryHTML([
      {
        speaker: 'Leader of Opposition',
        text: 'Mr Speaker, I think the Minister is trying to have his cake and eat it too. On one hand, he claims fiscal responsibility, but on the other, he proposes massive spending without clear revenue sources.',
        timestamp: '2:15 PM',
      },
      {
        speaker: 'Minister for Finance',
        text: 'I thank the Member for his question. Let me clarify that our fiscal position remains strong, with reserves that can sustain our commitments. The spending is targeted and necessary for our future.',
        timestamp: '2:17 PM',
      },
      {
        speaker: 'Ms Sylvia Lim',
        text: 'Mr Speaker, may I ask for clarification? The Minister mentions reserves, but can he provide specific figures on how much will be drawn down?',
        timestamp: '2:19 PM',
      },
    ]),
    questionCount: 3,
  },
  {
    startPgNo: 15,
    title: 'Climate Change and Sustainability',
    sectionType: 'OS',
    content: createParliamentaryHTML([
      {
        speaker: 'Minister for Sustainability',
        text: 'We cannot continue to kick the can down the road on climate action. The science is clear, the urgency is real, and we must act now. Our Green Plan 2030 sets ambitious targets.',
        timestamp: '3:30 PM',
      },
      {
        speaker: 'Mr Leong Mun Wai',
        text: 'Mr Speaker, while I appreciate the ambition, can the Minister address the concerns of small businesses who worry about the costs of compliance?',
        timestamp: '3:32 PM',
      },
    ]),
    questionCount: 2,
  },
  {
    startPgNo: 28,
    title: 'Housing Affordability',
    sectionType: 'OA',
    content: createParliamentaryHTML([
      {
        speaker: 'Minister for National Development',
        text: 'Housing remains affordable for the majority of Singaporeans. Our Build-To-Order system ensures supply meets demand, and grants are available for first-time buyers.',
        timestamp: '4:15 PM',
      },
      {
        speaker: 'Dr Tan Cheng Bock',
        text: 'But Minister, what about those caught in the middle? They earn too much for grants but struggle with high prices. This is the sandwich class problem.',
        timestamp: '4:17 PM',
      },
    ]),
    questionCount: 2,
  },
];

/**
 * Sample dates for testing
 */
export const SAMPLE_SITTING_DATES = [
  '02-07-2024',
  '09-07-2024',
  '16-07-2024',
  '23-07-2024',
];

/**
 * Helper to format date for display
 */
function formatDisplayDate(sittingDate: string): string {
  // Convert "02-07-2024" to "Tuesday, 2 July 2024"
  const [day, month, year] = sittingDate.split('-');
  const date = new Date(`${year}-${month}-${day}`);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return `${dayNames[date.getDay()]}, ${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
}

/**
 * Create a complete realistic Hansard for testing
 */
export const COMPLETE_HANSARD_FIXTURE: HansardJSON = createHansardResponse({
  date: '02-07-2024',
  parliamentNo: 15,
  sessionNo: 1,
  sections: DEFAULT_SECTIONS,
  attendance: DEFAULT_MPS,
});

/**
 * Create a minimal Hansard (edge case)
 */
export const MINIMAL_HANSARD_FIXTURE: HansardJSON = {
  metadata: {
    parlimentNO: 15,
    sessionNO: 1,
    sittingDate: '02-07-2024',
    dateToDisplay: 'Tuesday, 2 July 2024',
    startTimeStr: '12:00 noon',
    speaker: 'Speaker Tan Chuan-Jin',
  },
  takesSectionVOList: [
    {
      startPgNo: 1,
      title: 'Procedural',
      sectionType: 'OTHER',
      content: '<p>Parliament is adjourned.</p>',
    },
  ],
  attendanceList: [
    { mpName: 'Speaker Tan Chuan-Jin', attendance: true },
  ],
};

/**
 * Create an error scenario - invalid date
 */
export function createInvalidDateResponse(): Response {
  return createParliamentErrorResponse(
    'No Hansard record found for the specified date',
    404
  );
}

/**
 * Create an error scenario - API timeout
 */
export function createTimeoutResponse(): Response {
  return new Response(null, {
    status: 504,
    statusText: 'Gateway Timeout',
  });
}
