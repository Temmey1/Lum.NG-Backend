import {
  Controller, Post, UseGuards,
  UseInterceptors, UploadedFile,
  InternalServerErrorException, PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { R2StorageService } from '../storage/r2.service';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('upload')
export class UploadController {
  constructor(private readonly storage: R2StorageService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new InternalServerErrorException('No file provided or unsupported type');
    if (file.size > MAX_SIZE_BYTES) throw new PayloadTooLargeException(`File too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)`);
    if (!file.buffer) throw new InternalServerErrorException('File buffer missing');

    let url: string;
    let key: string;
    let size: number = file.size;

    if (this.storage.isEnabled()) {
      const r = await this.storage.uploadFile(file.buffer, file.originalname, file.mimetype, 'uploads');
      url = r.url;
      key = r.key;
      size = r.size;
    } else {
      const filename = `${uuid()}${extname(file.originalname)}`;
      const dir = join(process.cwd(), 'uploads');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, filename), file.buffer);
      url = `/uploads/${filename}`;
      key = `uploads/${filename}`;
    }

    return {
      success: true,
      url,
      key,
      filename: key.split('/').pop(),
      originalName: file.originalname,
      size,
    };
  }
}
