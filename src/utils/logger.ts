import winston from 'winston';
import { getEnv } from '../config/environment';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Define which log level to use based on the environment
const level = () => {
  const env = getEnv('NODE_ENV') || 'development';
  const logLevel = getEnv('LOG_LEVEL') || 'info';
  return env === 'development' ? 'debug' : logLevel;
};

// Define the format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info: any) => `${info.timestamp} [${info.level}]: ${info.message}`,
  ),
);

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define transports (where logs go)
const transports = [
  // Console transport
  new winston.transports.Console({
    format,
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/app.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
  }),
  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
  }),
];

// Create the main logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Export logger methods for convenience
export const logError = (message: string, error?: any) => logger.error(message, { error });
export const logInfo = (message: string, data?: any) => logger.info(message, data);
export const logWarn = (message: string, data?: any) => logger.warn(message, data);
export const logDebug = (message: string, data?: any) => logger.debug(message, data);