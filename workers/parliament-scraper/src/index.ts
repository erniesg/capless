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
  DATES_KV: KVNamespace;
}

interface DateMessage {
  date: string; // Format: DD-MM-YYYY
  attempt: number;
}

interface DateCheckRecord {
  last_checked: string; // ISO timestamp
  status: 'has_session' | 'no_session';
  attempts: number;
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
 * Check if date has been checked before (in KV)
 */
async function getDateCheck(kv: KVNamespace, date: string): Promise<DateCheckRecord | null> {
  const record = await kv.get(`date:${date}`, 'json');
  return record as DateCheckRecord | null;
}

/**
 * Mark date as checked in KV
 */
async function markDateChecked(
  kv: KVNamespace,
  date: string,
  status: 'has_session' | 'no_session',
  attempts: number = 1
): Promise<void> {
  const record: DateCheckRecord = {
    last_checked: new Date().toISOString(),
    status,
    attempts,
  };
  await kv.put(`date:${date}`, JSON.stringify(record));
}

/**
 * Check if date should be rechecked (within 14 days and no session found)
 */
function shouldRecheck(record: DateCheckRecord | null, date: string): boolean {
  if (!record) return true; // Never checked before

  if (record.status === 'has_session') return false; // Already found session

  // Parse DD-MM-YYYY
  const [day, month, year] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));

  return daysAgo <= 14; // Recheck if within last 14 days
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
      // GET /start - Start scraping from beginning (IDEMPOTENT)
      if (url.pathname === '/start' && request.method === 'GET') {
        const startDate = new Date('1955-04-22'); // First parliament sitting
        const endDate = new Date(); // Today

        console.log(`[Start] Generating dates from ${startDate.toISOString()} to ${endDate.toISOString()}`);

        const allDates = generateDateRange(startDate, endDate);
        console.log(`[Start] Total dates to process: ${allDates.length}`);

        // Get existing dates from R2 to skip them (idempotency)
        console.log(`[Start] Checking R2 for existing dates...`);
        const existingDates = new Set<string>();
        let cursor: string | undefined = undefined;

        do {
          const list = await env.R2.list({
            prefix: 'hansard/raw/',
            limit: 1000,
            cursor: cursor,
          });

          list.objects.forEach(obj => {
            const date = obj.key.replace('hansard/raw/', '').replace('.json', '');
            existingDates.add(date);
          });

          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);

        console.log(`[Start] Found ${existingDates.size} existing dates in R2`);

        // Filter dates: check KV for dates not in R2
        console.log(`[Start] Checking KV for date check history...`);
        const datesToCheck = allDates.filter(date => !existingDates.has(date));
        const datesToEnqueue: string[] = [];
        let kvSkipped = 0;
        let kvRecheck = 0;

        for (const date of datesToCheck) {
          const record = await getDateCheck(env.DATES_KV, date);

          if (shouldRecheck(record, date)) {
            datesToEnqueue.push(date);
            if (record) {
              kvRecheck++; // Rechecking recent date with no session
            }
          } else {
            kvSkipped++; // Already checked, no session, too old to recheck
          }
        }

        console.log(`[Start] KV filtering: ${kvSkipped} skipped (already checked), ${kvRecheck} recheck (within 14 days)`);
        console.log(`[Start] Final dates to enqueue: ${datesToEnqueue.length}`);

        if (datesToEnqueue.length === 0) {
          return new Response(
            JSON.stringify({
              message: 'All dates already processed or checked',
              total_dates: allDates.length,
              in_r2: existingDates.size,
              kv_skipped: kvSkipped,
              enqueued: 0,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Use sendBatch to avoid "Too many API requests" error (1000 subrequest limit)
        const messages = datesToEnqueue.map(date => ({
          body: {
            date,
            attempt: 0,
          } as DateMessage
        }));

        let enqueued = 0;
        const batchSize = 100;

        // Send in batches of 100
        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, i + batchSize);
          await env.DATES_QUEUE.sendBatch(batch);
          enqueued += batch.length;
        }

        console.log(`[Start] Enqueued ${enqueued} dates in ${Math.ceil(messages.length / batchSize)} batches`);

        return new Response(
          JSON.stringify({
            message: 'Scraping started (idempotent with KV tracking)',
            total_dates: allDates.length,
            in_r2: existingDates.size,
            kv_skipped: kvSkipped,
            kv_recheck: kvRecheck,
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
        let latestSession = 'None';
        if (allDates.length > 0) {
          const sortedDates = allDates.sort((a, b) => {
            // Sort by date (DD-MM-YYYY format)
            const [dayA, monthA, yearA] = a.split('-').map(Number);
            const [dayB, monthB, yearB] = b.split('-').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateB.getTime() - dateA.getTime();
          });
          latestSession = sortedDates[0] || 'None';
        }

        return new Response(
          JSON.stringify({
            sessions_scraped: scrapedCount,
            latest_session: latestSession,
            scraping_period: {
              from: '22-04-1955',
              to: endDate.toISOString().split('T')[0],
            },
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

      // GET /backfill-kv?offset=0&limit=500 - Populate KV with no_session for dates NOT in R2
      // Uses pagination to avoid hitting 1000 subrequest limit
      // Call multiple times with increasing offset until complete=true
      if (url.pathname === '/backfill-kv' && request.method === 'GET') {
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = parseInt(url.searchParams.get('limit') || '500', 10);

        console.log(`[Backfill] Starting batch: offset=${offset}, limit=${limit}`);

        // Step 1: Get all dates in R2 (dates WITH sessions)
        const r2Dates = new Set<string>();
        let cursor: string | undefined = undefined;

        do {
          const list = await env.R2.list({
            prefix: 'hansard/raw/',
            limit: 1000,
            cursor: cursor,
          });

          list.objects.forEach(obj => {
            const date = obj.key.replace('hansard/raw/', '').replace('.json', '');
            r2Dates.add(date);
          });

          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);

        console.log(`[Backfill] Found ${r2Dates.size} dates in R2 (with sessions)`);

        // Step 2: Generate all dates from 1955 to today
        const allDates = generateDateRange(new Date('1955-04-22'), new Date());
        const totalDates = allDates.length;

        // Step 3: Process only the requested batch
        const batch = allDates.slice(offset, offset + limit);
        let backfilled = 0;

        for (const date of batch) {
          // Skip if date is in R2 (already has session)
          if (r2Dates.has(date)) continue;

          // Write directly without checking (KV put is idempotent)
          await markDateChecked(env.DATES_KV, date, 'no_session', 1);
          backfilled++;
        }

        const processed = offset + batch.length;
        const complete = processed >= totalDates;
        const nextOffset = complete ? null : processed;

        console.log(`[Backfill] Batch complete: ${backfilled} entries written, ${processed}/${totalDates} total processed`);

        return new Response(
          JSON.stringify({
            message: complete ? 'KV backfill complete' : 'Batch processed',
            total_dates: totalDates,
            processed,
            backfilled_this_batch: backfilled,
            complete,
            next_offset: nextOffset,
            next_url: nextOffset ? `/backfill-kv?offset=${nextOffset}&limit=${limit}` : null,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // GET /sync-r2-batch - Sync R2 session dates to KV in batches (respects subrequest limits)
      if (url.pathname === '/sync-r2-batch' && request.method === 'GET') {
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);

        console.log(`[SyncBatch] Processing offset=${offset}, limit=${limit}`);

        // List R2 objects in this batch
        let allDates: string[] = [];
        let cursor: string | undefined = undefined;
        let fetched = 0;

        // Fetch R2 objects until we have enough for this batch
        do {
          const list = await env.R2.list({
            prefix: 'hansard/raw/',
            limit: 1000,
            cursor: cursor,
          });

          const dates = list.objects.map(obj =>
            obj.key.replace('hansard/raw/', '').replace('.json', '')
          );

          allDates.push(...dates);
          fetched += dates.length;
          cursor = list.truncated ? list.cursor : undefined;

          // Stop if we've fetched enough to cover this batch
          if (fetched >= offset + limit) break;
        } while (cursor);

        // Extract just the dates for this batch
        const batchDates = allDates.slice(offset, offset + limit);

        if (batchDates.length === 0) {
          return new Response(
            JSON.stringify({
              message: 'Sync complete - no more dates to process',
              offset,
              processed: 0,
              total_sessions: allDates.length,
              complete: true,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Update KV for this batch
        for (const date of batchDates) {
          await markDateChecked(env.DATES_KV, date, 'has_session', 1);
        }

        const totalSessions = allDates.length;
        const processed = Math.min(offset + batchDates.length, totalSessions);
        const complete = processed >= totalSessions;

        console.log(`[SyncBatch] Updated ${batchDates.length} dates, ${processed}/${totalSessions} total`);

        return new Response(
          JSON.stringify({
            message: complete ? 'Sync complete' : 'Batch synced',
            offset,
            processed: batchDates.length,
            total_processed: processed,
            total_sessions: totalSessions,
            complete,
            next_offset: complete ? null : offset + limit,
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

      return new Response('Parliament Hansard Scraper\n\nEndpoints:\n- GET /start: Start scraping (one-time)\n- GET /check-today: Check today and yesterday\n- GET /status: Check progress\n- GET /backfill-kv: Populate KV from R2 (one-time)\n- GET /health: Health check', {
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

        // Mark date as successfully checked in KV
        await markDateChecked(env.DATES_KV, date, 'has_session', attempt + 1);

        console.log(`[Success] ${date}`);
        message.ack(); // Mark as successfully processed

      } catch (error: any) {
        console.error(`[Error] ${date}:`, error.message);

        // HTTP 500 is expected (no session on this date) - skip immediately
        if (error.message.includes('HTTP 500')) {
          console.log(`[Skip] ${date}: No parliament session`);

          // Mark date as checked with no session in KV
          await markDateChecked(env.DATES_KV, date, 'no_session', attempt + 1);

          message.ack(); // Skip without retry
        } else if (attempt < 2) {
          // Real network/API errors - retry up to 3 times
          console.log(`[Retry] ${date}: Will retry (attempt ${attempt + 1}/3)`);
          message.retry();
        } else {
          // Max retries reached for real errors - mark as no_session to avoid infinite retries
          console.error(`[DLQ] ${date}: Max retries reached`);
          await markDateChecked(env.DATES_KV, date, 'no_session', attempt + 1);
          message.ack();
        }
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Queue] Batch complete`);
  },
};
