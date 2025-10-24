/**
 * Parliament Hansard Scraper with Cloudflare Queues
 *
 * Iterates through every date from 22-04-1955 to present day
 * Fetches Hansard reports from Parliament API and saves to R2
 * Uses Cloudflare Queues for rate limiting and resumability
 */

export interface Env {
  R2: R2Bucket;
  DATES_QUEUE: Queue;
}

interface DateMessage {
  date: string; // Format: DD-MM-YYYY
  attempt: number;
}

/**
 * Generate all dates from start to end
 */
function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const day = String(current.getDate()).padStart(2, '0');
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const year = current.getFullYear();
    dates.push(`${day}-${month}-${year}`);

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Check if date already exists in R2
 */
async function dateExists(r2: R2Bucket, date: string): Promise<boolean> {
  const key = `hansard/raw/${date}.json`;
  const object = await r2.head(key);
  return object !== null;
}

/**
 * Fetch Hansard report for a specific date
 */
async function fetchHansard(date: string): Promise<any> {
  const url = `https://sprs.parl.gov.sg/search/getHansardReport/?sittingDate=${date}`;

  console.log(`[Fetch] ${date}: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    // CRITICAL: Cancel response body to prevent "stalled HTTP response" deadlock
    // This frees up fetch concurrency slots and prevents Worker freezing
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Save raw Hansard response to R2
 */
async function saveToR2(r2: R2Bucket, date: string, data: any): Promise<void> {
  const key = `hansard/raw/${date}.json`;

  await r2.put(key, JSON.stringify(data, null, 2), {
    httpMetadata: {
      contentType: 'application/json',
    },
    customMetadata: {
      'scraped-at': new Date().toISOString(),
      'sitting-date': date,
    },
  });

  console.log(`[R2] Saved: ${key}`);
}

/**
 * Main worker handler
 */
export default {
  /**
   * HTTP endpoint to trigger scraping
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET /start - Start scraping from beginning
      if (url.pathname === '/start' && request.method === 'GET') {
        const startDate = new Date('1955-04-22'); // First parliament sitting
        const endDate = new Date(); // Today

        console.log(`[Start] Generating dates from ${startDate.toISOString()} to ${endDate.toISOString()}`);

        const allDates = generateDateRange(startDate, endDate);
        console.log(`[Start] Total dates to process: ${allDates.length}`);

        // Enqueue all dates without checking R2 (queue consumer will skip existing)
        // Use sendBatch to avoid "Too many API requests" error (1000 subrequest limit)
        const messages = allDates.map(date => ({
          body: {
            date,
            attempt: 0,
          } as DateMessage
        }));

        let enqueued = 0;
        const batchSize = 100;

        // Send in batches of 100 (25,754 dates = ~258 batch calls, well under 1000 limit)
        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, i + batchSize);
          await env.DATES_QUEUE.sendBatch(batch);
          enqueued += batch.length;
        }

        console.log(`[Start] Enqueued ${enqueued} dates in ${Math.ceil(messages.length / batchSize)} batches`);

        return new Response(
          JSON.stringify({
            message: 'Scraping started',
            total_dates: allDates.length,
            enqueued,
            start_date: '22-04-1955',
            end_date: new Date().toISOString().split('T')[0],
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // GET /status - Check scraping status
      if (url.pathname === '/status' && request.method === 'GET') {
        const startDate = new Date('1955-04-22');
        const endDate = new Date();
        const totalDates = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        // Count ALL scraped dates in R2 with pagination
        let scrapedCount = 0;
        let allDates: string[] = [];
        let cursor: string | undefined = undefined;

        do {
          const list = await env.R2.list({
            prefix: 'hansard/raw/',
            limit: 1000,
            cursor: cursor,
          });

          scrapedCount += list.objects.length;

          // Collect dates for finding latest
          allDates.push(...list.objects.map(obj =>
            obj.key.replace('hansard/raw/', '').replace('.json', '')
          ));

          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);

        // Find latest date from ALL R2 objects
        let lastDateChecked = 'Unknown';
        if (allDates.length > 0) {
          const sortedDates = allDates.sort((a, b) => {
            // Sort by date (DD-MM-YYYY format)
            const [dayA, monthA, yearA] = a.split('-').map(Number);
            const [dayB, monthB, yearB] = b.split('-').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateB.getTime() - dateA.getTime();
          });
          lastDateChecked = sortedDates[0] || 'Unknown';
        }

        // Estimate total expected sessions based on parliamentary history
        // Parliament sits ~100-120 days/year, average ~110 days/year over 70 years
        const yearsElapsed = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const estimatedTotalSessions = Math.round(yearsElapsed * 110);
        const estimatedProgress = estimatedTotalSessions > 0
          ? `${((scrapedCount / estimatedTotalSessions) * 100).toFixed(1)}%`
          : '0%';

        return new Response(
          JSON.stringify({
            total_dates: totalDates,
            sessions_found: scrapedCount,
            estimated_total_sessions: estimatedTotalSessions,
            estimated_progress: estimatedProgress,
            latest_session_date: lastDateChecked,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // GET /check-today - Check all dates from last scraped to today
      if (url.pathname === '/check-today' && request.method === 'GET') {
        // Find the latest date in R2 with pagination
        let allDates: string[] = [];
        let cursor: string | undefined = undefined;

        do {
          const list = await env.R2.list({
            prefix: 'hansard/raw/',
            limit: 1000,
            cursor: cursor,
          });

          allDates.push(...list.objects.map(obj =>
            obj.key.replace('hansard/raw/', '').replace('.json', '')
          ));

          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);

        let startDate: Date;
        if (allDates.length > 0) {
          // Get latest scraped date from ALL dates
          const sortedDates = allDates.sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('-').map(Number);
            const [dayB, monthB, yearB] = b.split('-').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateB.getTime() - dateA.getTime();
          });
          const latestDateStr = sortedDates[0];

          const [day, month, year] = latestDateStr.split('-').map(Number);
          startDate = new Date(year, month - 1, day);
          startDate.setDate(startDate.getDate() + 1); // Start from next day
        } else {
          // No data yet, check last 7 days
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
        }

        const today = new Date();
        const datesToCheck = generateDateRange(startDate, today);

        console.log(`[CheckToday] Checking ${datesToCheck.length} dates from ${datesToCheck[0]} to ${datesToCheck[datesToCheck.length - 1]}`);

        // Enqueue all dates since last scrape
        const messages = datesToCheck.map(date => ({
          body: {
            date,
            attempt: 0,
          } as DateMessage
        }));

        if (messages.length > 0) {
          // Send in batches of 100
          for (let i = 0; i < messages.length; i += 100) {
            const batch = messages.slice(i, i + 100);
            await env.DATES_QUEUE.sendBatch(batch);
          }
        }

        return new Response(
          JSON.stringify({
            message: 'Daily check started',
            date_range: datesToCheck.length > 0 ? {
              from: datesToCheck[0],
              to: datesToCheck[datesToCheck.length - 1]
            } : null,
            enqueued: datesToCheck.length,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // GET /health
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'healthy',
            service: 'capless-parliament-scraper',
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response('Parliament Hansard Scraper\n\nEndpoints:\n- GET /start: Start scraping (one-time)\n- GET /check-today: Check today and yesterday\n- GET /status: Check progress\n- GET /health: Health check', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    } catch (error: any) {
      console.error('[Error]', error);
      return new Response(
        JSON.stringify({
          error: 'Error',
          message: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },

  /**
   * Queue consumer - Process batches of dates
   */
  async queue(batch: MessageBatch<DateMessage>, env: Env): Promise<void> {
    console.log(`[Queue] Processing batch of ${batch.messages.length} dates`);

    for (const message of batch.messages) {
      const { date, attempt } = message.body;

      try {
        console.log(`[Process] ${date} (attempt ${attempt + 1})`);

        // Check if already exists (could have been processed by another batch)
        if (await dateExists(env.R2, date)) {
          console.log(`[Skip] ${date} already exists`);
          message.ack();
          continue;
        }

        // Fetch Hansard report
        const hansard = await fetchHansard(date);

        // Save raw response to R2
        await saveToR2(env.R2, date, hansard);

        console.log(`[Success] ${date}`);
        message.ack(); // Mark as successfully processed

      } catch (error: any) {
        console.error(`[Error] ${date}:`, error.message);

        // HTTP 500 is expected (no session on this date) - skip immediately
        if (error.message.includes('HTTP 500')) {
          console.log(`[Skip] ${date}: No parliament session`);
          message.ack(); // Skip without retry
        } else if (attempt < 2) {
          // Real network/API errors - retry up to 3 times
          console.log(`[Retry] ${date}: Will retry (attempt ${attempt + 1}/3)`);
          message.retry();
        } else {
          // Max retries reached for real errors
          console.error(`[DLQ] ${date}: Max retries reached`);
          message.ack();
        }
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Queue] Batch complete`);
  },
};
