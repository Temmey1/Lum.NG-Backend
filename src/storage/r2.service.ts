import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { extname } from 'path';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  etag?: string;
}

export type StorageMode = 'r2' | 'disk' | 'disabled';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client | null = null;
  private readonly bucket: string | null = null;
  private readonly publicBaseUrl: string | null = null;
  private readonly accountId: string | null = null;
  private readonly mode: StorageMode;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID') || process.env.R2_ACCOUNT_ID;
    const accessKey = this.config.get<string>('R2_ACCESS_KEY_ID') || process.env.R2_ACCESS_KEY_ID;
    const secretKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') || process.env.R2_SECRET_ACCESS_KEY;
    const bucket = this.config.get<string>('R2_BUCKET_NAME') || process.env.R2_BUCKET_NAME;
    const publicBaseUrl =
      this.config.get<string>('R2_PUBLIC_URL') || process.env.R2_PUBLIC_URL || null;

    this.accountId = accountId || null;
    this.bucket = bucket || null;
    this.publicBaseUrl = publicBaseUrl;

    const required = [accountId, accessKey, secretKey, bucket].every(Boolean);

    if (!required) {
      this.mode = 'disk';
      this.logger.warn(
        '[R2] R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME env vars not all set. ' +
          'Falling back to LOCAL DISK storage (uploads won\'t survive Render restarts!). ' +
          'Set the 4 R2_ env vars to enable Cloudflare R2.'
      );
      return;
    }

    try {
      const endpoint = `https://${accountId!}.r2.cloudflarestorage.com`;
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId: accessKey!,
          secretAccessKey: secretKey!,
        },
        forcePathStyle: true,
      });
      this.mode = 'r2';
      this.logger.log(
        `✅ Cloudflare R2 enabled — bucket=${bucket!}, publicBaseUrl=${publicBaseUrl || '(using r2.dev or signed URLs)'}`
      );
    } catch (err) {
      this.mode = 'disk';
      this.logger.error('[R2] Failed to init S3Client, falling back to disk storage:', (err as Error).message);
    }
  }

  getMode(): StorageMode {
    return this.mode;
  }

  isEnabled(): boolean {
    return this.mode === 'r2';
  }

  private sanitizeFilename(originalName: string): string {
    const ext = extname(originalName || '').toLowerCase() || '.bin';
    const safeExt = /^\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(ext) ? ext : '.bin';
    return `${uuid()}${safeExt}`;
  }

  private buildPublicUrl(key: string): string {
    // Encode each path segment individually — encodeURIComponent(key) alone
    // would also encode the folder-separator slashes (uploads/xyz.jpg becomes
    // uploads%2Fxyz.jpg), and R2's edge does NOT decode %2F back into a real
    // path separator when resolving the object, so the file 404s even though
    // it's genuinely sitting there under the un-encoded key.
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.endsWith('/') ? this.publicBaseUrl.slice(0, -1) : this.publicBaseUrl;
      return `${base}/${encodedKey}`;
    }
    if (this.accountId && this.bucket) {
      return `https://${this.accountId}.r2.cloudflarestorage.com/${this.bucket}/${encodedKey}`;
    }
    return `/uploads/${encodedKey}`;
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    prefix: string = 'products',
  ): Promise<UploadResult> {
    if (this.mode !== 'r2' || !this.client || !this.bucket) {
      return this.diskFallback(buffer, originalName, prefix);
    }

    const key = `${prefix}/${this.sanitizeFilename(originalName)}`;
    const cleanMime = /^image\/(jpe?g|png|webp|gif|svg\+xml|bmp)$/i.test(mimeType)
      ? mimeType
      : 'application/octet-stream';
    const size = buffer.length;

    try {
      const cmd = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: cleanMime,
        CacheControl: 'public, max-age=31536000, immutable',
      });
      const res = await this.client.send(cmd);
      const url = this.buildPublicUrl(key);
      this.logger.log(`[R2] Uploaded ${key} (${this.formatSize(size)})`);
      return {
        url,
        key,
        size,
        etag: res.ETag?.replace(/"/g, ''),
      };
    } catch (err) {
      const msg = err instanceof S3ServiceException
        ? `[R2] Upload failed: ${err.name} — ${err.message}`
        : `[R2] Upload failed: ${(err as Error).message}`;
      this.logger.error(msg);
      throw err;
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    if (this.mode !== 'r2' || !this.client || !this.bucket) {
      return false;
    }
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.log(`[R2] Deleted ${key}`);
      return true;
    } catch (err) {
      this.logger.error(`[R2] Delete failed for ${key}: ${(err as Error).message}`);
      return false;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    if (this.mode !== 'r2' || !this.client || !this.bucket) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedDownloadUrl(key: string, expiresInSec: number = 3600): Promise<string | null> {
    if (this.mode !== 'r2' || !this.client || !this.bucket) return null;
    try {
      const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.client, cmd as any, { expiresIn: expiresInSec });
    } catch {
      return null;
    }
  }

  private async diskFallback(
    buffer: Buffer,
    originalName: string,
    prefix: string,
  ): Promise<UploadResult> {
    const filename = this.sanitizeFilename(originalName);
    const key = `${prefix}/${filename}`;
    const dir = require('path').join(process.cwd(), 'uploads', prefix);
    require('fs').mkdirSync(dir, { recursive: true });
    const fullPath = require('path').join(process.cwd(), 'uploads', filename);
    require('fs').writeFileSync(fullPath, buffer);
    return {
      url: `/uploads/${encodeURIComponent(filename)}`,
      key,
      size: buffer.length,
    };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
