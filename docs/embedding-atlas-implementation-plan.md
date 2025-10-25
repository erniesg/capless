# Singapore Parliament Embedding Atlas - Implementation Plan

## 1. Chunking Strategy (Based on Actual Data Structure)

### Primary Rule: **One Semantic Unit = One Chunk**

Based on actual hansard examination, here's the optimal chunking per section type:

#### A. Oral Answers & Statements (OA/OS) - **KEEP ENTIRE SECTION AS ONE CHUNK**
**Why**: Captures full policy discourse including:
- Main question from MP
- Minister's response
- Supplementary questions from multiple MPs
- Minister's follow-up responses
- Cross-party debate

**Example**: Oil spill session (02-07-2024) had 27 questions bundled into ONE OA section → This should be ONE chunk

**Metadata to preserve**:
```typescript
{
  chunk_id: "14-2-20240702-OA-1",
  type: "OA",
  title: "Clean-up Effort, Assessment of Impact...",
  speakers: ["Mr Saktiandi Supaat", "Minister Grace Fu", "Ms Jessica Tan", ...],
  main_speaker: "Minister Grace Fu",  // For ideological mapping
  questioners: ["Mr Saktiandi Supaat", "Ms Jessica Tan", ...],
  date: "02-07-2024",
  parliament: 14,
  session: 2,
  page_range: [1, 14],
  word_count: 8453,
  topics_mentioned: ["environment", "oil spill", "maritime"]  // Optional LLM extraction
}
```

#### B. Written Answers (WA) - **SPLIT INTO INDIVIDUAL Q&A PAIRS**
**Why**: Each WA is semantically independent

**Example**:
```
Chunk 1: Question about housing + Minister's answer
Chunk 2: Question about education + Minister's answer
```

**Metadata**:
```typescript
{
  chunk_id: "14-2-20240702-WA-5",
  type: "WA",
  questioner: "Mr Saktiandi Supaat",
  respondent: "Minister Lawrence Wong",
  ministry: "Ministry of Finance",
  // ... same metadata as above
}
```

#### C. Bill Readings & Debates (BI/BP) - **ENTIRE BILL AS ONE CHUNK**
**Why**: Full legislative context

**Metadata includes**:
- Bill name
- Reading stage (1st, 2nd, 3rd)
- All speakers (for/against)
- Voting outcome (if available)

#### D. Special Committees & Other Sections (WS, WANA) - **ENTIRE SECTION**
**Why**: Complete policy statement or committee report

---

## 2. Metadata for Unsupervised Ideological Mapping

### YES - Preserve ALL Speaker Information

**Critical fields for ideological positioning**:

```typescript
interface SpeakerMetadata {
  // From hansard content
  primary_speaker: string;  // Main speaker (minister, MP)
  all_speakers: string[];   // All participants in multi-MP exchanges

  // From attendance list (extract separately)
  speaker_party: string;    // PAP, WP, PSP, etc.
  speaker_role: string;     // Minister, MP, Leader of Opposition
  speaker_constituency: string;

  // Computed after embedding
  speaker_vector: number[];  // Aggregate embeddings for this speaker
}
```

### How to do unsupervised ideological mapping:

1. **Aggregate speaker embeddings**: For each speaker, average all their chunk embeddings
2. **PCA on speaker vectors**: Reduce speaker-level embeddings to 2D
3. **Visualize**: Plot speakers in 2D space (unsupervised positioning)
4. **Validate**: Check if government vs opposition clusters emerge naturally

**This requires NO labels** - just speaker attribution preserved during chunking.

---

## 3. Focus on 14th & 15th Parliament (2020-Present)

### You're absolutely right - Start with recent data

**Phase 1: Build atlas for 14th & 15th Parliament** (2020-2025)
- ~5 years of data
- Modern JSON format (no HTML parsing needed)
- Establishes baseline clusters and speaker positions

**Phase 2: Add historical data** (1955-2019) - "Afterthought"
Once Phase 1 is stable:
- Historical data slots into existing clusters OR creates new ones
- Cluster evolution algorithm handles it automatically
- Main value: tracking how topics evolved over decades

---

## 4. Cluster Evolution Tracking

### Algorithm for Tracking Cluster Changes Over Time

Based on embedding-atlas approach + our parliament context:

```python
def track_cluster_evolution(
    clusters_t0: List[Cluster],  # Previous clusters
    clusters_t1: List[Cluster],  # New clusters after adding data
    similarity_threshold: float = 0.7
) -> ClusterEvolution:
    """
    Compare clusters at two time points and classify changes
    """
    evolution = {
        'new': [],        # Clusters in t1 not in t0
        'consistent': [], # Clusters present in both (high overlap)
        'removed': [],    # Clusters in t0 not in t1
        'merged': [],     # Multiple t0 clusters → one t1 cluster
        'split': []       # One t0 cluster → multiple t1 clusters
    }

    # 1. Compute cluster similarity matrix
    # Compare cluster centroids or member overlap
    similarity_matrix = compute_cluster_similarity(clusters_t0, clusters_t1)

    # 2. Identify consistent clusters (1-to-1 mapping)
    for i, cluster_t0 in enumerate(clusters_t0):
        best_match_idx = np.argmax(similarity_matrix[i])
        best_similarity = similarity_matrix[i][best_match_idx]

        if best_similarity > similarity_threshold:
            evolution['consistent'].append({
                'old_id': cluster_t0.id,
                'new_id': clusters_t1[best_match_idx].id,
                'similarity': best_similarity,
                'label': cluster_t0.label,  # Keep existing label
                'size_change': len(clusters_t1[best_match_idx]) - len(cluster_t0)
            })

    # 3. Identify new clusters (no good match in t0)
    for j, cluster_t1 in enumerate(clusters_t1):
        if not has_match_in_consistent(cluster_t1, evolution['consistent']):
            evolution['new'].append({
                'new_id': cluster_t1.id,
                'size': len(cluster_t1),
                'label': None,  # Needs LLM labeling
                'representative_chunks': sample_chunks(cluster_t1, n=5)
            })

    # 4. Identify removed clusters (no good match in t1)
    for i, cluster_t0 in enumerate(clusters_t0):
        if not has_match_in_consistent(cluster_t0, evolution['consistent']):
            evolution['removed'].append({
                'old_id': cluster_t0.id,
                'label': cluster_t0.label,
                'last_seen': cluster_t0.latest_date
            })

    # 5. Detect merges (multiple t0 → one t1)
    # If multiple t0 clusters map to same t1 cluster
    evolution['merged'] = detect_merges(similarity_matrix, similarity_threshold)

    # 6. Detect splits (one t0 → multiple t1)
    # If one t0 cluster maps to multiple t1 clusters
    evolution['split'] = detect_splits(similarity_matrix, similarity_threshold)

    return evolution
```

### When to Re-cluster?

**Option A: Periodic Re-clustering** (Recommended)
- Re-cluster every N new parliamentary sessions (e.g., every 10 sessions)
- Compute cluster evolution between snapshots
- Users see "snapshot comparison" view

**Option B: Incremental Clustering**
- Add new embeddings to existing clusters using KNN
- Periodically re-cluster from scratch to catch structural changes
- More complex, but smoother UX

---

## 5. LLM-Assisted Cluster Labeling

### Process (Following Embedding-Atlas Approach)

```python
def label_cluster_with_llm(
    cluster: Cluster,
    model: str = "claude-3-5-sonnet-20241022"
) -> ClusterLabel:
    """
    Generate human-readable label for cluster using LLM
    """

    # 1. Sample representative chunks from cluster
    # Use chunks closest to cluster centroid
    representative_chunks = sample_closest_to_centroid(cluster, n=10)

    # 2. Construct prompt
    prompt = f"""You are analyzing Singapore Parliament transcripts.

Below are 10 representative excerpts from a cluster of similar parliamentary discussions.
Please provide:
1. A concise topic label (2-5 words)
2. A brief description (1 sentence)
3. Key themes (comma-separated)

Representative excerpts:
{format_chunks(representative_chunks)}

Respond in JSON format:
{{
  "label": "...",
  "description": "...",
  "themes": ["theme1", "theme2", ...]
}}
"""

    # 3. Call LLM
    response = anthropic.messages.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500
    )

    # 4. Parse and validate
    label_data = json.loads(response.content[0].text)

    return ClusterLabel(
        cluster_id=cluster.id,
        label=label_data['label'],
        description=label_data['description'],
        themes=label_data['themes'],
        confidence=calculate_label_confidence(cluster, label_data),
        generated_at=datetime.now()
    )
```

### When to Label?

1. **New clusters**: Label immediately when detected
2. **Consistent clusters**: Keep existing label (don't re-label)
3. **Merged clusters**: Re-label (since topic may have evolved)
4. **Split clusters**: Label each new sub-cluster

### Cost Management

- **Lazy labeling**: Only label clusters when user views them
- **Caching**: Store labels in metadata, never re-generate
- **Batch labeling**: Label multiple clusters in one LLM call (cheaper)

---

## 6. Live Updates & New Data Integration

### Pipeline for Adding New Parliamentary Sessions

```python
async def ingest_new_session(session_date: str):
    """
    Add new parliamentary session to existing atlas
    """

    # 1. Fetch new hansard from R2
    hansard = await fetch_hansard_from_r2(session_date)

    # 2. Chunk according to section types (OA, WA, BI, etc.)
    new_chunks = chunk_hansard(hansard)

    # 3. Generate embeddings for new chunks
    new_embeddings = embed_chunks(new_chunks, model="sentence-transformers/all-mpnet-base-v2")

    # 4. Store in Cloudflare Vectorize
    await vectorize.upsert(
        vectors=[
            {
                "id": chunk.chunk_id,
                "values": embedding,
                "metadata": chunk.metadata
            }
            for chunk, embedding in zip(new_chunks, new_embeddings)
        ]
    )

    # 5. Check if re-clustering is needed
    sessions_since_last_cluster = get_sessions_since_last_cluster()

    if sessions_since_last_cluster >= 10:  # Re-cluster every 10 sessions
        await trigger_reclustering()
    else:
        # Just assign new chunks to nearest existing clusters
        await assign_to_clusters(new_embeddings, existing_clusters)
```

### Live Rendering Options

**Option 1: Snapshot-based** (Simpler, recommended for v1)
- Atlas shows "clusters as of [date]"
- New data added to snapshot periodically (weekly/monthly)
- Users can compare snapshots over time

**Option 2: Real-time updates** (Complex, for v2)
- New embeddings appear immediately
- Cluster boundaries update dynamically
- Requires WebSocket connection for live updates

---

## 7. Implementation Roadmap

### Phase 1: MVP for 14th & 15th Parliament (Weeks 1-4)

**Week 1: Data Pipeline**
- [ ] Fetch all 14th & 15th Parliament hansards from R2
- [ ] Implement chunking logic (OA/OS as whole, WA as Q&A pairs)
- [ ] Extract speaker metadata
- [ ] Store chunks in Cloudflare D1 with metadata

**Week 2: Embedding & Clustering**
- [ ] Generate embeddings (sentence-transformers/all-mpnet-base-v2)
- [ ] Store in Cloudflare Vectorize
- [ ] Run UMAP dimensionality reduction → 2D coordinates
- [ ] Run HDBSCAN clustering
- [ ] Store cluster assignments in D1

**Week 3: Speaker Ideological Mapping**
- [ ] Aggregate embeddings by speaker
- [ ] Run PCA on speaker vectors → 2D
- [ ] Visualize speaker positions
- [ ] Validate government vs opposition separation

**Week 4: LLM Labeling & Visualization**
- [ ] Implement LLM-assisted cluster labeling (Claude API)
- [ ] Build basic web UI (embedding-view-mosaic style)
- [ ] Add cluster browsing and search

### Phase 2: Cluster Evolution & Live Updates (Weeks 5-8)

**Week 5: Cluster Evolution Algorithm**
- [ ] Implement cluster comparison (new/consistent/removed/merged/split)
- [ ] Build snapshot comparison UI
- [ ] Add temporal filters (view clusters by date range)

**Week 6: Live Data Integration**
- [ ] Build ingestion pipeline for new sessions
- [ ] Implement incremental embedding generation
- [ ] Add automated re-clustering triggers

**Week 7: Historical Data (1955-2019)**
- [ ] Extend chunking to handle HTML format (for pre-2010 data)
- [ ] Batch-process historical hansards
- [ ] Add to atlas and observe cluster evolution

**Week 8: Polish & Deployment**
- [ ] Optimize performance (caching, lazy loading)
- [ ] Add export features (CSV, JSON)
- [ ] Deploy to Cloudflare Workers
- [ ] Write documentation

---

## 8. Technology Stack

```
Data Storage:
- Cloudflare R2: Raw hansard JSON files
- Cloudflare D1: Chunk metadata, speaker info, cluster assignments
- Cloudflare Vectorize: Embeddings (768-dim vectors)

Compute:
- Python (Modal.com): Embedding generation, clustering
- Cloudflare Workers: API endpoints, data serving

Embedding Model:
- sentence-transformers/all-mpnet-base-v2 (768 dimensions)

Clustering:
- UMAP: 768D → 2D projection
- HDBSCAN: Density-based clustering

LLM Labeling:
- Anthropic Claude 3.5 Sonnet (via API)

Frontend:
- Observable Framework (like embedding-atlas)
- OR React + D3.js for custom viz
```

---

## 9. Cost Estimates

**Setup (One-time)**:
- Embedding generation: ~15,000 chunks × $0.0001 = **$1.50**
- LLM labeling: ~100 clusters × $0.01 = **$1.00**
- **Total setup: ~$2.50**

**Monthly Operations**:
- New session ingestion: ~50 chunks/session × 4 sessions/month = **$0.02**
- Re-clustering: Monthly = **$0.50**
- Cloudflare Workers: Free tier (100k requests/day)
- **Total monthly: ~$0.52**

**Insanely cheap!**

---

## 10. Key Decisions Summary

| Question | Answer |
|----------|--------|
| **How to chunk?** | OA/OS = whole section, WA = individual Q&A, BI/BP = whole bill |
| **Keep speaker names?** | YES - essential for ideological mapping |
| **Start with 14th & 15th?** | YES - get MVP working, then add historical |
| **Cluster evolution?** | Periodic re-clustering (every 10 sessions) + evolution tracking algorithm |
| **LLM labeling?** | Claude 3.5 Sonnet with representative chunks, lazy labeling on demand |
| **Live updates?** | Snapshot-based for v1 (weekly/monthly updates), real-time for v2 |

---

## Next Steps

1. **Review this plan** - adjust based on your priorities
2. **Start with Week 1 tasks** - build data pipeline
3. **Iterate quickly** - get MVP working before adding complexity
4. **Monitor clusters** - see what topics emerge naturally

Ready to start building? 🚀
