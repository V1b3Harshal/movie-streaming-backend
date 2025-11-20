#!/usr/bin/env node

// =================================================================
// ALGOLIA CHECK SCRIPT
// Check if data exists in Algolia indices
// Run with: node scripts/check-algolia.js
// =================================================================

const algoliasearch = require('algoliasearch');
require('dotenv').config();

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;

if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY) {
  console.error('❌ Missing Algolia credentials');
  process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

async function checkIndex(indexName) {
  try {
    const index = client.initIndex(indexName);

    // Get index info
    const info = await index.getSettings();
    console.log(`📊 ${indexName} Index Settings:`, JSON.stringify(info, null, 2));

    // Search for all objects
    const results = await index.search('', {
      hitsPerPage: 5,
      attributesToRetrieve: ['title', 'type', 'tmdb_id']
    });

    console.log(`📈 ${indexName} Search Results:`, {
      totalHits: results.nbHits,
      hits: results.hits.map(h => ({ title: h.title, type: h.type, tmdb_id: h.tmdb_id }))
    });

    return results.nbHits;
  } catch (error) {
    console.error(`❌ Error checking ${indexName}:`, error.message);
    return 0;
  }
}

async function main() {
  console.log('🔍 Checking Algolia indices...\n');

  const moviesCount = await checkIndex('movies');
  console.log('');
  const tvShowsCount = await checkIndex('tv_shows');

  console.log('\n📊 Summary:');
  console.log(`   Movies: ${moviesCount}`);
  console.log(`   TV Shows: ${tvShowsCount}`);
  console.log(`   Total: ${moviesCount + tvShowsCount}`);

  if (moviesCount === 0 && tvShowsCount === 0) {
    console.log('\n❌ No data found! Run: npm run populate:algolia');
  } else {
    console.log('\n✅ Data found in Algolia!');
  }
}

main().catch(console.error);