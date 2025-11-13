/**
 * Quick test to verify R2 fetch and metadata structure
 */
import { chunkBySections, type HansardData } from './src/lib/chunking';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

async function testR2Fetch(date: string) {
  const sep = '='.repeat(60);
  console.log(`\n${sep}`);
  console.log(`R2 FETCH TEST`);
  console.log(`Date: ${date}`);
  console.log(`${sep}\n`);

  try {
    const r2Key = `hansard/cleaned/${date}.json`;
    const tmpFile = `/tmp/hansard-${date}.json`;

    console.log(`📥 Fetching from R2: ${r2Key}...`);

    execSync(
      `npx wrangler r2 object get capless-preview/${r2Key} --file ${tmpFile}`,
      { stdio: 'ignore' }
    );

    const content = readFileSync(tmpFile, 'utf-8');
    const data = JSON.parse(content) as HansardData;

    console.log(`✅ Successfully fetched Hansard from R2`);
    console.log(`   Sections: ${data.takesSectionVOList?.length || 0}`);
    console.log(`   Parliament metadata:`);
    console.log(`     - Parliament Number: ${data.metadata?.parlimentNO || 'N/A'}`);
    console.log(`     - Session Number: ${data.metadata?.sessionNO || 'N/A'}`);
    console.log(`     - Sitting Number: ${data.metadata?.sittingNO || 'N/A'}`);
    console.log(`     - Date Display: ${data.metadata?.dateToDisplay || 'N/A'}`);

    console.log(`\n📦 Creating chunks...`);
    const chunks = chunkBySections(data);
    console.log(`✅ Created ${chunks.length} chunks`);

    console.log(`\n📋 First chunk metadata (showing enhanced fields):`);
    if (chunks.length > 0) {
      const firstChunk = chunks[0];
      console.log(JSON.stringify({
        chunk_id: firstChunk.metadata.chunk_id,
        sections: firstChunk.metadata.sections,
        section_titles: firstChunk.metadata.section_titles,
        section_types: firstChunk.metadata.section_types,
        char_count: firstChunk.metadata.char_count,
        section_page_ranges: firstChunk.metadata.section_page_ranges,
        has_section_html: !!firstChunk.metadata.section_html
      }, null, 2));
    }

    console.log(`\n✅ R2 fetch and enhanced metadata structure verified!`);

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

const testDate = process.argv[2] || '06-08-2024';
testR2Fetch(testDate);
