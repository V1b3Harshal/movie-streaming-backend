import { logger, httpLogger, errorLogger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    // Clear any existing log files before each test
    jest.clearAllMocks();
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have correct log levels', () => {
      expect(logger.levels).toBeDefined();
      expect(logger.levels.error).toBe(0);
      expect(logger.levels.warn).toBe(1);
      expect(logger.levels.info).toBe(2);
      expect(logger.levels.http).toBe(3);
      expect(logger.levels.debug).toBe(4);
    });

    it('should log info messages', () => {
      const infoSpy = jest.spyOn(logger, 'info');
      logger.info('Test info message');
      expect(infoSpy).toHaveBeenCalledWith('Test info message');
    });

    it('should log error messages', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      logger.error('Test error message');
      expect(errorSpy).toHaveBeenCalledWith('Test error message');
    });

    it('should log warn messages', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      logger.warn('Test warn message');
      expect(warnSpy).toHaveBeenCalledWith('Test warn message');
    });

    it('should log debug messages', () => {
      const debugSpy = jest.spyOn(logger, 'debug');
      logger.debug('Test debug message');
      expect(debugSpy).toHaveBeenCalledWith('Test debug message');
    });
  });

  describe('httpLogger', () => {
    it('should be defined', () => {
      expect(httpLogger).toBeDefined();
    });

    it('should log HTTP messages', () => {
      const httpSpy = jest.spyOn(httpLogger, 'http');
      httpLogger.http('Test HTTP message');
      expect(httpSpy).toHaveBeenCalledWith('Test HTTP message');
    });
  });

  describe('errorLogger', () => {
    it('should be defined', () => {
      expect(errorLogger).toBeDefined();
    });

    it('should log error messages', () => {
      const errorSpy = jest.spyOn(errorLogger, 'error');
      errorLogger.error('Test error message');
      expect(errorSpy).toHaveBeenCalledWith('Test error message');
    });
  });
});