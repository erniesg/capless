# Singapore Parliament Hansard Data Structure Evolution (1955-2025)

## Summary of Findings

Based on analysis of actual parliament transcript data from multiple time periods, here's the evolution of hansard data structure:

### Time Periods Analyzed
1. **1955** (22-04-1955): First parliament sitting
2. **1965** (16-12-1965): Post-independence era
3. **1988** (11-01-1988): 1980s parliamentary records
4. **2000** (21-02-2000): Early 21st century
5. **2024** (02-07-2024): Modern 14th Parliament
6. **2025** (22-09-2025): Current 15th Parliament

### Data Format Evolution

#### Phase 1: Raw HTML Format (1955 - ~2010s)
- **Structure**: Single `htmlFullContent` field containing raw HTML
- **Speakers**: Unstructured tags like `<b>Mr Speaker:</b>`, `<b>Prime Minister:</b>`
- **Formatting**: Column markers, manual formatting
- **Example files**: 1955, 1965, 1988, 2000

**Sample from 1955**:
```html
<b>Mr Speaker:</b> I have to inform you that His Excellency the Governor
will be in this Assembly at 11 o'clock to deliver his Opening Address.
```

#### Phase 2: Structured JSON (2010s - Present)
- **Structure**: `takesSectionVOList` array with typed sections
- **Metadata**: Parliament number, session number, sitting date
- **Section Types**:
  - **OA** (Oral Answers): Questions with minister responses
  - **OS** (Oral Statements): Ministerial statements
  - **WA** (Written Answers): Individual Q&A pairs
  - **WANA** (Written Answers Not Answered): Postponed answers  
  - **BI/BP** (Bills Introduction/Passage): Legislative debates
  - **WS** (Written Statements): Written policy statements

**Modern structure (2024-2025)**:
```json
{
  "metadata": {
    "parlimentNO": 14,
    "sessionNO": 2,
    "sittingDate": "02-07-2024",
    "dateToDisplay": "Tuesday, 2 July 2024"
  },
  "takesSectionVOList": [
    {
      "sectionType": "OA",
      "title": "Clean-up Effort, Assessment of Impact...",
      "content": "<p>1 <strong>Mr Saktiandi Supaat</strong> asked Minister...</p>",
      "startPgNo": 1,
      "endPgNo": 14
    }
  ]
}
```

### Embedding Atlas Chunking Strategy

Based on actual data examination, here's the recommended chunking approach for the 14th and 15th Parliaments:

#### 1. Focus on Modern JSON Format (2010s-present)
- Use only `takesSectionVOList` format (no HTML parsing needed for embedding atlas)
- This covers 14th Parliament (2020-2024) and 15th Parliament (2024-present)

#### 2. Chunk by Section Type

**Policy Debates (OA/OS sections)**:
- Keep entire section as ONE chunk
- Rationale: Captures complete policy discussion including multi-MP exchanges
- Average length: ~5,000-15,000 chars
- Example: Oil spill debate with 27 bundled questions = 1 chunk

**Written Q&A (WA sections)**:
- Split into individual question-answer pairs
- Rationale: Each QA is semantically independent
- Average length: ~500-2,000 chars per pair

**Legislative Bills (BI/BP sections)**:
- Keep entire bill debate as ONE chunk
- Rationale: Captures full legislative discourse

### Metadata Schema for Embeddings

```typescript
interface ChunkMetadata {
  chunk_id: string;  // e.g., "parliament-14-2-20240702-OA-1"
  date: string;  // DD-MM-YYYY
  parliament: number;  // 14 or 15
  session: number;
  type: "OA" | "OS" | "WA" | "BI" | "BP" | "WS";
  title: string;
  speakers: string[];  // Extracted from <strong> tags
  page_range: [number, number];
  word_count: number;
}
```

### Implementation Notes

1. **No HTML parsing needed**: Modern format already structured
2. **Speaker extraction**: Parse `<strong>Name</strong>` tags from content
3. **Chunk size**: Most chunks will be 500-15,000 chars (well within embedding model limits)
4. **Parliament filtering**: Simple metadata check (`parliament === 14 || parliament === 15`)

### Next Steps for Embedding Atlas

1. ✅ Analyzed data structure across 70 years of parliament
2. ✅ Determined chunking strategy (section-based)
3. 🔜 Set up embedding pipeline (sentence-transformers)
4. 🔜 Implement HDBSCAN clustering
5. 🔜 Build UMAP visualizations
6. 🔜 LLM-assisted cluster labeling

