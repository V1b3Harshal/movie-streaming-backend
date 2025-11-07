import { MongoClient, Db, Collection, CreateIndexesOptions } from 'mongodb';
import { getDb } from '../config/database';
import { logger } from '../utils/logger';

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  serverSelectionTimeoutMS?: number;
}

export interface IndexDefinition {
  key: any;
  options?: CreateIndexesOptions;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Db | null = null;
  private isConnected = false;

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      const client = new MongoClient(config.uri, {
        maxPoolSize: config.maxPoolSize || 10,
        minPoolSize: config.minPoolSize || 0,
        maxIdleTimeMS: config.maxIdleTimeMS || 30000,
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 5000,
        // SSL/TLS configuration for production
        tls: config.uri.includes('ssl=true') || config.uri.includes('tls=true'),
        tlsAllowInvalidCertificates: process.env.NODE_ENV === 'development',
        tlsCAFile: process.env.MONGODB_SSL_CA_FILE
      });

      await client.connect();
      this.db = client.db(config.dbName);
      this.isConnected = true;

      logger.info(`Connected to MongoDB database: ${config.dbName}`);
      
      // Test the connection
      await this.db.admin().ping();
      logger.info('MongoDB connection test successful');
      
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  getDb(): Db {
    if (!this.db || !this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  // Create indexes for better performance
  async ensureIndexes(collectionName: string, indexes: IndexDefinition[]): Promise<void> {
    try {
      const collection = this.getDb().collection(collectionName);
      
      for (const index of indexes) {
        await collection.createIndex(index.key, index.options);
        logger.info(`Created index on ${collectionName}:`, Object.keys(index.key));
      }
    } catch (error) {
      logger.error(`Failed to create indexes on ${collectionName}:`, error);
      throw error;
    }
  }

  // Get collection with performance optimization
  getCollection<T extends Document>(name: string): Collection<T> {
    return this.getDb().collection<T>(name);
  }

  // Execute query with performance logging
  async executeQuery<T>(
    collectionName: string,
    query: any,
    options: any = {},
    operation: 'find' | 'findOne' | 'aggregate' = 'find'
  ): Promise<any> {
    const startTime = Date.now();
    const collection = this.getCollection<Document>(collectionName);

    try {
      let result;
      
      switch (operation) {
        case 'findOne':
          result = await collection.findOne(query, options);
          break;
        case 'aggregate':
          result = await collection.aggregate(query, options).toArray();
          break;
        case 'find':
        default:
          result = await collection.find(query, options).toArray();
          break;
      }

      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > 100) {
        logger.warn(`Slow query detected on ${collectionName}: ${duration}ms`, {
          query,
          options,
          operation
        });
      }

      return result;
    } catch (error) {
      logger.error(`Query failed on ${collectionName}:`, error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected' };
      }

      const startTime = Date.now();
      await this.getDb().admin().ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          responseTime,
          connected: this.isConnected
        }
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Get database statistics
  async getStats(): Promise<any> {
    try {
      const adminDb = this.getDb().admin();
      const dbStats = await adminDb.command({ dbStats: 1 });
      const serverStatus = await adminDb.serverStatus();
      
      return {
        database: {
          collections: dbStats.collections,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          indexSize: dbStats.indexSize,
          objects: dbStats.objects
        },
        server: {
          connections: serverStatus.connections,
          network: serverStatus.network,
          opcounters: serverStatus.opcounters
        }
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      throw error;
    }
  }

  // Disconnect from database
  async disconnect(): Promise<void> {
    try {
      if (this.db) {
        const client = this.db.client;
        await client.close();
        this.isConnected = false;
        logger.info('Disconnected from MongoDB');
      }
    } catch (error) {
      logger.error('Failed to disconnect from MongoDB:', error);
      throw error;
    }
  }
}

export const databaseService = DatabaseService.getInstance();