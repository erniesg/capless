/**
 * Upload test transcript to R2 storage for local testing
 * Run with: tsx scripts/upload-test-transcript.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the processed transcript
const transcriptPath = resolve(__dirname, '../../../output/processed-transcript.json');
const transcript = JSON.parse(readFileSync(transcriptPath, 'utf-8'));

console.log('📄 Read transcript:', transcript.transcript_id);
console.log('📊 Segments:', transcript.metadata.total_segments);

// Make HTTP request to upload endpoint
const uploadUrl = 'http://localhost:8789/api/test/upload-transcript';

fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(transcript),
})
  .then((res) => res.json())
  .then((data) => {
    console.log('✅ Upload response:', data);
  })
  .catch((err) => {
    console.error('❌ Upload failed:', err);
  });
