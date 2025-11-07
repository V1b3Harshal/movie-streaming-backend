import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Validate SSL/TLS configuration for production
const validateSSLConfiguration = () => {
  if (process.env.NODE_ENV === 'production') {
    const mongoUri = process.env.MONGODB_URI || '';
    
    // Check if MongoDB URI includes SSL/TLS settings
    if (!mongoUri.includes('ssl=true') && !mongoUri.includes('tls=true')) {
      console.warn('WARNING: Production environment detected but SSL/TLS is not enabled for MongoDB connection');
      console.warn('Please ensure your MongoDB connection string includes SSL/TLS settings');
      console.warn('Example: mongodb://user:pass@host:port/db?ssl=true&tls=true');
    }
    
    // Check for SSL certificate validation
    if (mongoUri.includes('ssl=true') && !mongoUri.includes('tlsAllowInvalidCertificates=false')) {
      console.warn('WARNING: SSL enabled but certificate validation is disabled');
      console.warn('Consider enabling certificate validation in production');
    }
  }
};

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/movie-streaming-backend';

// Clean and validate URI - remove duplicate/conflicting parameters
const cleanUri = mongoUri
  .replace(/([?&])retryWrites=true&?/g, '$1') // Remove duplicate retryWrites
  .replace(/([?&])w=majority&?/g, '$1') // Remove duplicate w=majority
  .replace(/([?&])ssl=true&?/g, '$1') // Remove duplicate ssl=true
  .replace(/([?&])tls=true&?/g, '$1') // Remove duplicate tls=true
  .replace(/([?&])tlsAllowInvalidCertificates=false&?/g, '$1') // Remove duplicate tlsAllowInvalidCertificates
  .replace(/([?&])appName=[^&]*&?/g, '$1') // Remove appName parameter
  .replace(/([?&])$/, ''); // Remove trailing ? or &

// Apply clean SSL/TLS settings
const finalMongoUri = cleanUri.includes('ssl=true') || cleanUri.includes('tls=true')
  ? cleanUri
  : `${cleanUri}?ssl=true&tls=true&tlsAllowInvalidCertificates=false&retryWrites=true&w=majority`;

console.log('MongoDB URI (masked):', finalMongoUri.replace(/\/\/[^@]+@/, '//***:***@'));

const client = new MongoClient(finalMongoUri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000, // Increased to 30 seconds
  retryWrites: true,
  retryReads: true
});

let db: any;

export const connectToDatabase = async () => {
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      validateSSLConfiguration();
      
      console.log(`Attempting to connect to MongoDB (attempt ${retryCount + 1}/${maxRetries})...`);
      await client.connect();
      db = client.db();
      
      console.log('Connected to MongoDB successfully');
      console.log('SSL/TLS Status:', finalMongoUri.includes('ssl=true') || finalMongoUri.includes('tls=true') ? 'Enabled' : 'Disabled');
      
      // Test the connection with a simple ping
      await db.admin().ping();
      console.log('MongoDB connection verified with ping');
      
      return;
    } catch (error) {
      retryCount++;
      console.error(`MongoDB connection attempt ${retryCount} failed:`, error instanceof Error ? error.message : String(error));
      
      if (retryCount < maxRetries) {
        console.log(`Retrying in ${2 * retryCount} seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
      } else {
        console.error('MongoDB connection failed after all retries');
        console.error('Please check your MONGODB_URI environment variable');
        console.error('Ensure your MongoDB Atlas cluster is accessible and the connection string is correct');
        process.exit(1);
      }
    }
  }
};

export const getDb = () => {
  if (!db) {
    throw new Error('Database not connected');
  }
  return db;
};

export const closeDatabase = async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};

// Get database connection status
export const getDatabaseStatus = () => {
  return {
    isConnected: !!db,
    sslEnabled: finalMongoUri.includes('ssl=true') || finalMongoUri.includes('tls=true'),
    mongoUri: finalMongoUri.replace(/\/\/[^@]+@/, '//***:***@'), // Hide credentials
    environment: process.env.NODE_ENV || 'development'
  };
};