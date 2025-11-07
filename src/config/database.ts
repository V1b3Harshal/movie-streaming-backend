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

// Apply SSL/TLS settings if not explicitly configured
const finalMongoUri = !mongoUri.includes('ssl=true') && !mongoUri.includes('tls=true')
  ? `${mongoUri}?ssl=true&tls=true&tlsAllowInvalidCertificates=true`
  : mongoUri;

const client = new MongoClient(finalMongoUri);

let db: any;

export const connectToDatabase = async () => {
  try {
    validateSSLConfiguration();
    
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB successfully');
    console.log('SSL/TLS Status:', finalMongoUri.includes('ssl=true') || finalMongoUri.includes('tls=true') ? 'Enabled' : 'Disabled');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
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