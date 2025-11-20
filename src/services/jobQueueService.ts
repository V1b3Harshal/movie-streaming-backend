// Background Job Processing Service using Upstash Redis REST API
import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

interface JobData {
  [key: string]: any;
}

interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface QueuedJob {
  id: string;
  name: string;
  data: JobData;
  priority: number;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: JobResult;
  error?: string;
  nextRunAt?: number;
}

class JobQueueService {
  private redisClient: any;
  private processingInterval: NodeJS.Timeout | null = null;
  private jobProcessors: Map<string, (job: QueuedJob) => Promise<JobResult>> = new Map();

  /**
   * Initialize the job queue service
   */
  async initialize(): Promise<void> {
    try {
      this.redisClient = getRedisClient();

      // Register job processors
      this.registerJobProcessors();

      // Start processing jobs
      this.startProcessing();

      logger.info('Job queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize job queue service:', error);
      throw error;
    }
  }

  /**
   * Register job processors for different job types
   */
  private registerJobProcessors(): void {
    // Default jobs
    this.jobProcessors.set('sendEmail', this.processEmailJob.bind(this));
    this.jobProcessors.set('dataExport', this.processDataExportJob.bind(this));
    this.jobProcessors.set('heavyComputation', this.processHeavyComputationJob.bind(this));

    // Notification jobs
    this.jobProcessors.set('sendPushNotification', this.processPushNotificationJob.bind(this));
    this.jobProcessors.set('sendEmailNotification', this.processEmailNotificationJob.bind(this));
    this.jobProcessors.set('sendWebhook', this.processWebhookJob.bind(this));

    // Cleanup jobs
    this.jobProcessors.set('cleanupExpiredData', this.processCleanupExpiredDataJob.bind(this));
    this.jobProcessors.set('cleanupOldLogs', this.processCleanupOldLogsJob.bind(this));
    this.jobProcessors.set('cleanupTempFiles', this.processCleanupTempFilesJob.bind(this));

    // Analytics jobs
    this.jobProcessors.set('trackUserEvent', this.processTrackUserEventJob.bind(this));
    this.jobProcessors.set('generateAnalyticsReport', this.processGenerateAnalyticsReportJob.bind(this));
    this.jobProcessors.set('updateMetrics', this.processUpdateMetricsJob.bind(this));
  }

  /**
   * Start processing jobs at regular intervals
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      try {
        await this.processPendingJobs();
      } catch (error) {
        logger.error('Error processing jobs:', error);
      }
    }, 5000); // Process every 5 seconds

    logger.info('Job processing started');
  }

  /**
   * Add a job to the queue
   */
  async addJob(queueName: string, jobName: string, data: JobData, options: any = {}): Promise<string> {
    const jobId = `job:${queueName}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    const job: QueuedJob = {
      id: jobId,
      name: jobName,
      data,
      priority: options.priority || 0,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: options.attempts || 3,
      status: 'pending',
    };

    try {
      // Store job in Redis
      const jobKey = `queue:${queueName}:jobs`;
      await this.redisClient.hset(jobKey, jobId, JSON.stringify(job));

      // Add to pending queue
      const pendingKey = `queue:${queueName}:pending`;
      await this.redisClient.zadd(pendingKey, [{ score: job.priority, value: jobId }]);

      logger.info(`Added job ${jobId} (${jobName}) to queue ${queueName}`);
      return jobId;
    } catch (error) {
      logger.error(`Failed to add job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a recurring job
   */
  async scheduleJob(queueName: string, jobName: string, data: JobData, cronExpression: string, options: any = {}): Promise<void> {
    // For simplicity, we'll just add the job - in a real implementation you'd parse cron
    await this.addJob(queueName, jobName, { ...data, cronExpression }, options);
    logger.info(`Scheduled recurring job ${jobName} in queue ${queueName} with cron: ${cronExpression}`);
  }

  /**
   * Process pending jobs
   */
  private async processPendingJobs(): Promise<void> {
    // Process each queue type
    const queues = ['default', 'notifications', 'cleanup', 'analytics'];

    for (const queueName of queues) {
      try {
        await this.processQueue(queueName);
      } catch (error) {
        logger.error(`Error processing queue ${queueName}:`, error);
      }
    }
  }

  /**
   * Process jobs in a specific queue
   */
  private async processQueue(queueName: string): Promise<void> {
    const pendingKey = `queue:${queueName}:pending`;
    const processingKey = `queue:${queueName}:processing`;

    try {
      // Get next job (highest priority first) - zrange returns array directly
      const pendingJobs = await this.redisClient.zrange(pendingKey, 0, 0, { REV: true });
      if (!pendingJobs?.result?.length) return;

      const jobId = pendingJobs.result[0];

      // Move job to processing
      await this.redisClient.zrem(pendingKey, jobId);
      await this.redisClient.zadd(processingKey, [{ score: Date.now(), value: jobId }]);

      // Get job data
      const jobKey = `queue:${queueName}:jobs`;
      const jobData = await this.redisClient.hget(jobKey, jobId);
      if (!jobData?.result) {
        await this.redisClient.zrem(processingKey, jobId);
        return;
      }

      const job: QueuedJob = JSON.parse(jobData.result);
      job.status = 'processing';
      job.attempts++;

      // Update job status
      await this.redisClient.hset(jobKey, jobId, JSON.stringify(job));

      // Process the job
      try {
        const processor = this.jobProcessors.get(job.name);
        if (!processor) {
          throw new Error(`No processor found for job type: ${job.name}`);
        }

        const result = await processor(job);

        // Mark as completed
        job.status = 'completed';
        job.result = result;
        await this.redisClient.hset(jobKey, jobId, JSON.stringify(job));

        // Remove from processing
        await this.redisClient.zrem(processingKey, jobId);

        logger.info(`Job ${jobId} completed successfully`);
      } catch (error) {
        logger.error(`Job ${jobId} failed:`, error);

        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);

        if (job.attempts < job.maxAttempts) {
          // Retry the job
          job.status = 'pending';
          await this.redisClient.zadd(pendingKey, [{ score: job.priority, value: jobId }]);
          logger.info(`Retrying job ${jobId} (attempt ${job.attempts}/${job.maxAttempts})`);
        } else {
          // Mark as permanently failed
          await this.redisClient.hset(jobKey, jobId, JSON.stringify(job));
        }

        // Remove from processing
        await this.redisClient.zrem(processingKey, jobId);
      }
    } catch (error) {
      logger.error(`Error processing queue ${queueName}:`, error);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<any> {
    try {
      const pendingKey = `queue:${queueName}:pending`;
      const processingKey = `queue:${queueName}:processing`;

      const [pendingCount, processingCount] = await Promise.all([
        this.redisClient.zcard(pendingKey),
        this.redisClient.zcard(processingKey),
      ]);

      return {
        queueName,
        pending: pendingCount?.result || 0,
        processing: processingCount?.result || 0,
        total: (pendingCount?.result || 0) + (processingCount?.result || 0),
      };
    } catch (error) {
      logger.error(`Failed to get stats for queue ${queueName}:`, error);
      return { queueName, pending: 0, processing: 0, total: 0 };
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<any[]> {
    const queues = ['default', 'notifications', 'cleanup', 'analytics'];
    const stats = [];

    for (const queueName of queues) {
      const queueStats = await this.getQueueStats(queueName);
      stats.push(queueStats);
    }

    return stats;
  }

  /**
   * Gracefully shutdown the job queue service
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down job queue service...');

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Job queue service shutdown complete');
  }

  // Job processors

  private async processEmailJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing email job:', job.data);
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, data: { emailId: 'mock-email-id' } };
  }

  private async processDataExportJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing data export job:', job.data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, data: { exportId: 'mock-export-id' } };
  }

  private async processHeavyComputationJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing heavy computation job:', job.data);
    const result = Array.from({ length: 100000 }, (_, i) => i * i).reduce((a, b) => a + b, 0);
    return { success: true, data: { result } };
  }

  private async processPushNotificationJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing push notification job:', job.data);
    return { success: true, data: { notificationId: 'mock-notification-id' } };
  }

  private async processEmailNotificationJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing email notification job:', job.data);
    return { success: true, data: { emailId: 'mock-email-notification-id' } };
  }

  private async processWebhookJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing webhook job:', job.data);
    return { success: true, data: { webhookId: 'mock-webhook-id' } };
  }

  private async processCleanupExpiredDataJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing cleanup expired data job:', job.data);
    return { success: true, data: { cleanedCount: 42 } };
  }

  private async processCleanupOldLogsJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing cleanup old logs job:', job.data);
    return { success: true, data: { deletedFiles: 5 } };
  }

  private async processCleanupTempFilesJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing cleanup temp files job:', job.data);
    return { success: true, data: { deletedFiles: 12 } };
  }

  private async processTrackUserEventJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing track user event job:', job.data);
    return { success: true, data: { eventId: 'mock-event-id' } };
  }

  private async processGenerateAnalyticsReportJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing generate analytics report job:', job.data);
    return { success: true, data: { reportId: 'mock-report-id' } };
  }

  private async processUpdateMetricsJob(job: QueuedJob): Promise<JobResult> {
    logger.info('Processing update metrics job:', job.data);
    return { success: true, data: { metricsUpdated: 25 } };
  }
}

// Export singleton instance
export const jobQueueService = new JobQueueService();
export default jobQueueService;