// =================================================================
// IMAGEKIT IMAGE OPTIMIZATION INTEGRATION
// Free tier: 20GB bandwidth/month
// ImageKit: https://imagekit.io
// =================================================================

import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
}

export interface ImageTransformationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpg' | 'png' | 'webp' | 'avif';
  crop?: 'maintain_ratio' | 'force';
  blur?: number;
  grayscale?: boolean;
  dpr?: number;
  focus?: 'center' | 'top' | 'left' | 'right' | 'bottom';
  overlayImage?: string;
  overlayFocus?: 'center' | 'top' | 'left' | 'right' | 'bottom';
  overlayX?: number;
  overlayY?: number;
}

class ImageKitService {
  private static instance: ImageKitService;
  private config: ImageKitConfig | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ImageKitService {
    if (!ImageKitService.instance) {
      ImageKitService.instance = new ImageKitService();
    }
    return ImageKitService.instance;
  }

  public init(config?: ImageKitConfig): void {
    if (this.isInitialized) {
      logger.warn('ImageKit already initialized');
      return;
    }

    try {
      this.config = config || {
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
      };

      if (!this.config.publicKey || !this.config.privateKey || !this.config.urlEndpoint) {
        logger.warn('ImageKit configuration missing, skipping initialization');
        return;
      }

      this.isInitialized = true;
      logger.info('ImageKit initialized successfully');
      
      // Test connection
      this.testConnection().catch(error => {
        logger.warn('ImageKit connection test failed:', error);
      });
    } catch (error) {
      logger.error('Failed to initialize ImageKit:', error);
    }
  }

  private async testConnection(): Promise<void> {
    if (!this.config) return;

    try {
      // Test with a simple request
      const testUrl = `${this.config.urlEndpoint}/?ik-probe=1`;
      const response = await fetch(testUrl);
      
      if (response.ok) {
        logger.info('ImageKit connection test successful');
      } else {
        throw new Error(`ImageKit test failed with status: ${response.status}`);
      }
    } catch (error) {
      logger.error('ImageKit connection test failed:', error);
      throw error;
    }
  }

  /**
   * Generate optimized URL for an image
   */
  getOptimizedUrl(imagePath: string, options: ImageTransformationOptions = {}): string {
    if (!this.isInitialized || !this.config) {
      logger.warn('ImageKit not initialized');
      return imagePath;
    }

    const baseUrl = this.config.urlEndpoint;
    const imageUrl = `${baseUrl}/${imagePath}`;
    
    const transformations: string[] = [];
    
    if (options.width) transformations.push(`w-${options.width}`);
    if (options.height) transformations.push(`h-${options.height}`);
    if (options.quality) transformations.push(`q-${options.quality}`);
    if (options.format) transformations.push(`f-${options.format}`);
    if (options.crop) transformations.push(`c-${options.crop}`);
    if (options.blur) transformations.push(`bl-${options.blur}`);
    if (options.grayscale) transformations.push('e-grayscale');
    if (options.dpr) transformations.push(`dpr-${options.dpr}`);
    if (options.focus) transformations.push(`fo-${options.focus}`);
    
    if (transformations.length === 0) {
      return imageUrl;
    }
    
    return `${imageUrl}?tr=${transformations.join(',')}`;
  }

  /**
   * Generate URL for movie poster with optimizations
   */
  getMoviePosterUrl(posterPath: string, options: {
    size?: 'small' | 'medium' | 'large';
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
  } = {}): string {
    if (!posterPath || posterPath === 'null' || posterPath === 'undefined') {
      return '/default-movie-poster.jpg'; // Default fallback
    }

    const sizeConfigs = {
      small: { width: 300, height: 450 },
      medium: { width: 500, height: 750 },
      large: { width: 800, height: 1200 }
    };

    const size = sizeConfigs[options.size || 'medium'];
    const format = options.format || 'webp';
    const quality = options.quality || 80;

    // If it's a TMDB poster URL, use ImageKit's proxy
    if (posterPath.startsWith('https://image.tmdb.org/')) {
      // For TMDB images, we'll use ImageKit's URL transformation
      return this.getOptimizedUrl(`proxy/${posterPath}`, {
        width: size.width,
        height: size.height,
        quality,
        format: format as any,
        crop: 'force',
        dpr: 2
      });
    }

    return this.getOptimizedUrl(posterPath, {
      width: size.width,
      height: size.height,
      quality,
      format: format as any,
      crop: 'force',
      dpr: 2
    });
  }

  /**
   * Generate URL for backdrop/banner images
   */
  getBackdropUrl(backdropPath: string, options: {
    width?: number;
    quality?: number;
  } = {}): string {
    if (!backdropPath || backdropPath === 'null' || backdropPath === 'undefined') {
      return '/default-backdrop.jpg';
    }

    const width = options.width || 1920;
    const quality = options.quality || 80;

    if (backdropPath.startsWith('https://image.tmdb.org/')) {
      return this.getOptimizedUrl(`proxy/${backdropPath}`, {
        width,
        quality,
        format: 'webp',
        crop: 'force'
      });
    }

    return this.getOptimizedUrl(backdropPath, {
      width,
      quality,
      format: 'webp',
      crop: 'force'
    });
  }

  /**
   * Generate thumbnail URL for video content
   */
  getVideoThumbnailUrl(thumbnailPath: string, options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}): string {
    if (!thumbnailPath) {
      return '/default-video-thumbnail.jpg';
    }

    const width = options.width || 400;
    const height = options.height || 225;
    const quality = options.quality || 75;

    if (thumbnailPath.startsWith('https://image.tmdb.org/')) {
      return this.getOptimizedUrl(`proxy/${thumbnailPath}`, {
        width,
        height,
        quality,
        format: 'webp',
        crop: 'force'
      });
    }

    return this.getOptimizedUrl(thumbnailPath, {
      width,
      height,
      quality,
      format: 'webp',
      crop: 'force'
    });
  }

  /**
   * Upload image to ImageKit
   */
  async uploadImage(file: Buffer, fileName: string, folder: string = 'uploads'): Promise<any> {
    if (!this.isInitialized || !this.config) {
      logger.warn('ImageKit not initialized');
      return null;
    }

    try {
      const token = this.generateUploadToken();
      const signature = this.generateSignature(fileName, folder);
      
      // Create a proper file from Buffer (simplified for TypeScript compatibility)
      const formData = new FormData();
      formData.append('file', file as any, fileName);
      formData.append('fileName', fileName);
      formData.append('folder', folder);
      formData.append('token', token);
      formData.append('signature', signature);
      formData.append('publicKey', this.config.publicKey);

      const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        logger.info('Image uploaded to ImageKit successfully', { fileName });
        return result;
      } else {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to upload image to ImageKit:', error);
      return null;
    }
  }

  /**
   * Generate authentication token for uploads
   */
  private generateUploadToken(): string {
    const timestamp = Math.floor(Date.now() / 1000);
    return crypto.randomBytes(16).toString('hex') + timestamp;
  }

  /**
   * Generate signature for uploads
   */
  private generateSignature(fileName: string, folder: string): string {
    if (!this.config) return '';
    
    const timestamp = Math.floor(Date.now() / 1000);
    const token = this.generateUploadToken();
    const dataToSign = `token=${token}&timestamp=${timestamp}&folder=${folder}&fileName=${fileName}`;
    
    return crypto
      .createHmac('sha1', this.config.privateKey)
      .update(dataToSign)
      .digest('hex');
  }

  /**
   * Delete image from ImageKit
   */
  async deleteImage(fileId: string): Promise<boolean> {
    if (!this.isInitialized || !this.config) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.config.urlEndpoint}/v1/files/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.privateKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.ok;
    } catch (error) {
      logger.error('Failed to delete image from ImageKit:', error);
      return false;
    }
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      initialized: this.isInitialized,
      configured: !!this.config?.publicKey && !!this.config?.privateKey && !!this.config?.urlEndpoint,
      urlEndpoint: this.config?.urlEndpoint || null,
      publicKey: this.config?.publicKey ? '***' + this.config.publicKey.slice(-4) : null
    };
  }
}

export const imageKitService = ImageKitService.getInstance();
export default imageKitService;