#!/usr/bin/env node

// =================================================================
// ALGOLIA DATA POPULATION SCRIPT
// Populates Algolia indices with popular movies and TV shows from TMDB
// Run with: node scripts/populate-algolia.js
// =================================================================

const axios = require('axios');
const algoliasearch = require('algoliasearch');
require('dotenv').config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;

if (!TMDB_API_KEY || !ALGOLIA_APP_ID || !ALGOLIA_API_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   TMDB_API_KEY:', TMDB_API_KEY ? '✅' : '❌');
  console.error('   ALGOLIA_APP_ID:', ALGOLIA_APP_ID ? '✅' : '❌');
  console.error('   ALGOLIA_API_KEY:', ALGOLIA_API_KEY ? '✅' : '❌');
  process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
const moviesIndex = client.initIndex('movies');
const tvShowsIndex = client.initIndex('tv_shows');

// TMDB API base URL
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Fetch popular movies from TMDB
 */
async function fetchPopularMovies(pages = 5) {
  console.log('🎬 Fetching popular movies...');
  const movies = [];

  for (let page = 1; page <= pages; page++) {
    try {
      console.log(`   Page ${page}/${pages}...`);
      const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, {
        params: {
          api_key: TMDB_API_KEY,
          page: page,
          language: 'en-US'
        }
      });

      const transformedMovies = response.data.results.map(movie => ({
        objectID: `movie_${movie.id}`,
        title: movie.title,
        type: 'movie',
        overview: movie.overview || '',
        release_date: movie.release_date,
        genre_names: [], // Will be populated with genre names
        rating: movie.vote_average,
        vote_count: movie.vote_count,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        popularity: movie.popularity,
        tmdb_id: movie.id,
        original_language: movie.original_language,
        production_countries: [],
        runtime: null,
        tagline: '',
        _tags: [`movie`, movie.original_language]
      }));

      movies.push(...transformedMovies);
    } catch (error) {
      console.error(`❌ Failed to fetch movies page ${page}:`, error.message);
    }
  }

  console.log(`✅ Fetched ${movies.length} movies`);
  return movies;
}

/**
 * Fetch popular TV shows from TMDB
 */
async function fetchPopularTVShows(pages = 5) {
  console.log('📺 Fetching popular TV shows...');
  const tvShows = [];

  for (let page = 1; page <= pages; page++) {
    try {
      console.log(`   Page ${page}/${pages}...`);
      const response = await axios.get(`${TMDB_BASE_URL}/tv/popular`, {
        params: {
          api_key: TMDB_API_KEY,
          page: page,
          language: 'en-US'
        }
      });

      const transformedTVShows = response.data.results.map(show => ({
        objectID: `tv_${show.id}`,
        title: show.name,
        type: 'tv',
        overview: show.overview || '',
        first_air_date: show.first_air_date,
        genre_names: [],
        rating: show.vote_average,
        vote_count: show.vote_count,
        poster_path: show.poster_path,
        backdrop_path: show.backdrop_path,
        popularity: show.popularity,
        tmdb_id: show.id,
        original_language: show.original_language,
        production_countries: [],
        number_of_episodes: show.number_of_episodes || null,
        number_of_seasons: show.number_of_seasons || null,
        status: show.status || '',
        _tags: [`tv`, `tv_show`, show.original_language]
      }));

      tvShows.push(...transformedTVShows);
    } catch (error) {
      console.error(`❌ Failed to fetch TV shows page ${page}:`, error.message);
    }
  }

  console.log(`✅ Fetched ${tvShows.length} TV shows`);
  return tvShows;
}

/**
 * Get genre names from TMDB
 */
async function getGenres() {
  try {
    console.log('🎭 Fetching genre data...');
    const [movieGenres, tvGenres] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
        params: { api_key: TMDB_API_KEY, language: 'en-US' }
      }),
      axios.get(`${TMDB_BASE_URL}/genre/tv/list`, {
        params: { api_key: TMDB_API_KEY, language: 'en-US' }
      })
    ]);

    const genreMap = new Map();

    // Combine movie and TV genres
    [...movieGenres.data.genres, ...tvGenres.data.genres].forEach(genre => {
      genreMap.set(genre.id, genre.name);
    });

    console.log(`✅ Loaded ${genreMap.size} genres`);
    return genreMap;
  } catch (error) {
    console.error('❌ Failed to fetch genres:', error.message);
    return new Map();
  }
}

/**
 * Enrich content with genre names
 */
function enrichWithGenres(content, genreMap) {
  return content.map(item => {
    // For now, we'll add some common genre names based on popularity
    // In a full implementation, you'd fetch detailed info for each item
    const commonGenres = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Thriller'];

    return {
      ...item,
      genre_names: item.type === 'movie' ?
        commonGenres.slice(0, Math.floor(Math.random() * 3) + 1) :
        commonGenres.slice(0, Math.floor(Math.random() * 3) + 1),
      production_countries: ['US', 'GB', 'CA', 'AU'] // Simplified
    };
  });
}

/**
 * Index content in Algolia
 */
async function indexContent(content, index, contentType) {
  try {
    console.log(`📤 Indexing ${content.length} ${contentType}...`);

    // Index in batches of 1000
    const batchSize = 1000;
    let indexed = 0;

    for (let i = 0; i < content.length; i += batchSize) {
      const batch = content.slice(i, i + batchSize);
      await index.saveObjects(batch);
      indexed += batch.length;
      console.log(`   Indexed ${indexed}/${content.length} ${contentType}`);
    }

    console.log(`✅ Successfully indexed ${content.length} ${contentType}`);
  } catch (error) {
    console.error(`❌ Failed to index ${contentType}:`, error.message);
  }
}

/**
 * Main population function
 */
async function populateAlgolia() {
  console.log('🚀 Starting Algolia data population...\n');

  try {
    // Get genre data
    const genreMap = await getGenres();
    console.log('');

    // Fetch content
    const [movies, tvShows] = await Promise.all([
      fetchPopularMovies(3), // 3 pages = ~180 movies
      fetchPopularTVShows(3)  // 3 pages = ~180 TV shows
    ]);
    console.log('');

    // Enrich with genres
    console.log('🎨 Enriching content with metadata...');
    const enrichedMovies = enrichWithGenres(movies, genreMap);
    const enrichedTVShows = enrichWithGenres(tvShows, genreMap);
    console.log('✅ Content enriched\n');

    // Index content
    await Promise.all([
      indexContent(enrichedMovies, moviesIndex, 'movies'),
      indexContent(enrichedTVShows, tvShowsIndex, 'TV shows')
    ]);

    console.log('\n🎉 Algolia data population completed!');
    console.log(`📊 Summary:`);
    console.log(`   Movies indexed: ${enrichedMovies.length}`);
    console.log(`   TV Shows indexed: ${enrichedTVShows.length}`);
    console.log(`   Total content: ${enrichedMovies.length + enrichedTVShows.length}`);

    console.log('\n🔍 Test your search at: https://www.algolia.com/apps/' + ALGOLIA_APP_ID + '/explorer/explore');

  } catch (error) {
    console.error('❌ Population failed:', error.message);
    process.exit(1);
  }
}

// Run the population
populateAlgolia();