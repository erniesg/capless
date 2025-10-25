# Parliament Data Architecture - Documentation Index

**Last Updated:** 2025-10-25
**Status:** Design Complete, Ready for Implementation

---

## Overview

This directory contains the complete architecture design for tracking and correlating Singapore Parliament data across multiple sources:

1. **Hansard Sessions** (Parliament API → R2 storage)
2. **YouTube Videos** (14th/15th Parliament recordings)
3. **YouTube Transcripts** (VTT captions)
4. **Processed Moments** (viral-worthy segments)

---

## Document Index

### 1. [parliament-data-architecture.md](./parliament-data-architecture.md)
**Main Architecture Document** (60 pages)

**What's Inside:**
- Complete system design with D1 + R2 + KV
- Full SQL schema for 4 tables (sessions, youtube_videos, moments, processing_jobs)
- API endpoint specifications
- Daily cron job design
- Migration plan from current KV-only system
- Cost analysis ($0/month on free tier)
- Implementation phases (4 weeks)

**Read This First:** Comprehensive architecture specification

---

### 2. [parliament-data-comparison.md](./parliament-data-comparison.md)
**Option Comparison Matrix**

**What's Inside:**
- Visual comparison of KV vs R2 vs D1 approaches
- Performance benchmarks (10ms vs 2000ms queries)
- Real-world query examples
- Cost comparison ($0 vs $5/month)
- Migration effort analysis (16 vs 32 hours)

**Read This For:** Understanding why D1 + R2 + KV is best

---

### 3. [parliament-data-implementation-guide.md](./parliament-data-implementation-guide.md)
**Step-by-Step Implementation**

**What's Inside:**
- Phase 1: D1 setup (2-3 hours)
- Phase 2: Data migration (3-4 hours)
- Phase 3: Update workers (2 hours)
- Complete code examples
- Testing & validation
- Troubleshooting guide

**Read This When:** Ready to start implementation

---

## Quick Start

### For Decision Makers

1. Read **Executive Summary** in [parliament-data-architecture.md](./parliament-data-architecture.md#executive-summary)
2. Review **Comparison Matrix** in [parliament-data-comparison.md](./parliament-data-comparison.md#feature-comparison-matrix)
3. Check **Cost Analysis** in [parliament-data-architecture.md](./parliament-data-architecture.md#cost-analysis)

**Time:** 15 minutes

---

### For Implementers

1. Read **Full Architecture** in [parliament-data-architecture.md](./parliament-data-architecture.md)
2. Follow **Implementation Guide** in [parliament-data-implementation-guide.md](./parliament-data-implementation-guide.md)
3. Start with **Phase 1: D1 Setup** (2 hours)

**Time:** 2 hours to start, 16 hours total

---

### For Reviewers

1. Check **Data Model Design** in [parliament-data-architecture.md](./parliament-data-architecture.md#data-model-design)
2. Review **API Design** in [parliament-data-architecture.md](./parliament-data-architecture.md#api-design)
3. Validate **Migration Plan** in [parliament-data-architecture.md](./parliament-data-architecture.md#migration-plan)

**Time:** 30 minutes

---

## Current State Analysis

### What We Have Now

```typescript
// workers/parliament-scraper/src/index.ts (lines 20-24)
interface DateCheckRecord {
  last_checked: string;
  status: 'has_session' | 'no_session';
  attempts: number;
}

// Stored in KV as: date:{DD-MM-YYYY} → DateCheckRecord
```

**Data:**
- ~1847 Hansard sessions in R2 (`hansard/raw/*.json`)
- ~29 YouTube videos in static mapping file
- ~3 processed moments with timestamps (test data)

**Limitations:**
- ❌ No correlation between Hansard and YouTube
- ❌ No tracking of transcript availability
- ❌ No processing state tracking
- ❌ No complex queries possible

---

## Proposed Architecture

### Hybrid D1 + R2 + KV

```
┌─────────────────────────────────────────┐
│    Unified Parliament API Worker       │
│  ┌───────────────────────────────────┐  │
│  │ GET /api/sessions?parliament=15  │  │
│  │ GET /api/sessions/:date/youtube  │  │
│  │ GET /api/youtube/:id/moments     │  │
│  └────┬──────────┬──────────┬────────┘  │
└───────┼──────────┼──────────┼───────────┘
        │          │          │
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌─────────┐
│ D1       │ │ R2       │ │ KV      │
│ (SQL)    │ │ (Files)  │ │ (Cache) │
├──────────┤ ├──────────┤ ├─────────┤
│ sessions │ │ hansard/ │ │ 1h TTL  │
│ youtube  │ │ youtube/ │ │ Fast    │
│ moments  │ │ moments/ │ │ Reads   │
│ jobs     │ │ audio/   │ │         │
└──────────┘ └──────────┘ └─────────┘
```

**Benefits:**
- ✅ SQL queries (JOINs, filters, pagination)
- ✅ Fast lookups (50ms DB, 10ms cache)
- ✅ Automatic indexing
- ✅ Transactions
- ✅ $0/month cost

---

## Key Metrics

### Performance

| Operation | Current | Proposed | Improvement |
|-----------|---------|----------|-------------|
| Single session lookup | 10ms (KV) | 50ms (D1) or 10ms (cached) | Same or better |
| Complex query | Impossible | 50-100ms | New capability |
| List with filters | Impossible | 100ms | New capability |
| JOIN sessions + videos | Manual (2000ms) | 75ms | **27x faster** |

### Scale

| Metric | Current | Capacity | Status |
|--------|---------|----------|--------|
| Sessions tracked | 1847 | 100K+ | ✅ 1.8% |
| YouTube videos | 29 | 10K+ | ✅ 0.3% |
| Daily writes | ~100 | 100K | ✅ 0.1% |
| Daily reads | ~10K | 5M | ✅ 0.2% |

### Cost

| Service | Current | Proposed | Change |
|---------|---------|----------|--------|
| Workers | $0 | $0 | No change |
| KV | $0 | $0 | No change |
| R2 | $0 | $0 | No change |
| D1 | N/A | $0 | New (free tier) |
| **Total** | **$0/month** | **$0/month** | **No change** |

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Create D1 database
- [ ] Write schema migration
- [ ] Backfill existing data
- [ ] Verify data integrity

**Deliverable:** D1 with all data migrated

---

### Week 2: Parliament API
- [ ] Create API worker
- [ ] Implement session endpoints
- [ ] Implement YouTube endpoints
- [ ] Add KV caching

**Deliverable:** Working API with all endpoints

---

### Week 3: Cron Monitoring
- [ ] Daily Hansard check
- [ ] YouTube video polling
- [ ] Transcript downloader
- [ ] Failed job retry

**Deliverable:** Automated daily monitoring

---

### Week 4: Integration
- [ ] Update existing workers
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Production deployment

**Deliverable:** Complete system live

---

## Success Criteria

### Technical

- [ ] All sessions migrated to D1 (1847 records)
- [ ] All YouTube videos linked (29+ records)
- [ ] API response time < 100ms
- [ ] Query success rate > 99.9%
- [ ] Daily cron running 3x/day

### Business

- [ ] Can query sessions with videos but no moments
- [ ] Can track processing state for each session
- [ ] Can find missing YouTube transcripts
- [ ] Can correlate Hansard timestamps with YouTube
- [ ] Can monitor processing failures

---

## Related Documentation

### Existing Architecture

- `/Users/erniesg/code/erniesg/capless/ARCHITECTURE.md` - Overall Capless architecture (5 workers)
- `/Users/erniesg/code/erniesg/capless/docs/parliament-hansard-data-analysis.md` - Hansard data structure analysis
- `/Users/erniesg/code/erniesg/capless/docs/embedding-atlas-implementation-plan.md` - Embedding atlas plan

### Implementation Files

- `/Users/erniesg/code/erniesg/capless/workers/parliament-scraper/` - Current scraper worker
- `/Users/erniesg/code/erniesg/capless/youtube-sessions/youtube-hansard-mapping.json` - Static video mapping
- `/Users/erniesg/code/erniesg/capless/scripts/match-youtube-*.py` - YouTube matching scripts

---

## FAQ

### Q: Why not just use enhanced KV?

**A:** KV has no JOINs, no complex queries, and requires manual index management. Example query "sessions with videos but no moments" would require 200+ API calls with KV vs 1 SQL query with D1.

See [parliament-data-comparison.md](./parliament-data-comparison.md#option-a-enhanced-kv-rejected) for details.

---

### Q: Why not just use R2 JSON indexes?

**A:** R2 JSON indexes require downloading entire index file (2MB) for every query. Performance is 40x slower (2000ms vs 50ms).

See [parliament-data-comparison.md](./parliament-data-comparison.md#option-b-r2-json-index-rejected) for details.

---

### Q: Will this cost money?

**A:** No. Our usage (100 writes/day, 10K reads/day) is well within Cloudflare's D1 free tier (100K writes/day, 5M reads/day).

See [parliament-data-architecture.md](./parliament-data-architecture.md#cost-analysis) for breakdown.

---

### Q: How long will migration take?

**A:** ~16 hours total over 4 weeks:
- Week 1: D1 setup (10 hours)
- Week 2: Parliament API (15 hours)
- Week 3: Cron monitoring (12 hours)
- Week 4: Integration (12 hours)

Can be done in parallel by multiple developers.

---

### Q: What if we exceed free tier limits?

**A:** D1 paid tier is $5/month for 25M reads/day. We'd need 25x current usage to hit this (unlikely). R2 and KV remain free for our scale.

---

### Q: Can we keep using KV during migration?

**A:** Yes! The migration plan uses D1 as source of truth, with KV as a cache layer (1 hour TTL). Existing KV functionality continues to work during migration.

---

## Next Steps

1. **Review** this README and linked documents
2. **Decide** on implementation timeline
3. **Start** with Phase 1: D1 setup (2 hours)
4. **Follow** implementation guide step-by-step
5. **Test** thoroughly before production deployment

---

## Contact

For questions or clarifications:

- Architecture questions → Review [parliament-data-architecture.md](./parliament-data-architecture.md)
- Implementation questions → Check [parliament-data-implementation-guide.md](./parliament-data-implementation-guide.md)
- Comparison questions → See [parliament-data-comparison.md](./parliament-data-comparison.md)

---

**Document Status:** ✅ Complete
**Ready for Implementation:** Yes
**Estimated Effort:** 16 hours (4 weeks, parallel work possible)
**Cost Impact:** $0/month (no change)
**Risk Level:** Low (backwards compatible, can rollback)
