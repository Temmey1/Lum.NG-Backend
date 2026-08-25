import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards,
  UseInterceptors, UploadedFile, ParseIntPipe,
  InternalServerErrorException, PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { R2StorageService } from '../storage/r2.service';

const multerStorage = memoryStorage();

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly storage: R2StorageService,
  ) {}

  @Get()
  async findAll(@Query() query: Record<string, string>) {
    const list = await this.products.findAll(query);
    return { products: list, total: list.length };
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.products.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: Record<string, unknown>) {
    return this.products.create(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.products.update(id, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.products.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const existing = await this.products.findOne(id).catch(() => null);
    if (existing?.imageUrl) {
      const r2Key = this.extractR2Key(existing.imageUrl);
      if (r2Key) await this.storage.deleteFile(r2Key).catch(() => {});
    }
    await this.products.remove(id);
    return { success: true };
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', {
    storage: multerStorage,
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.includes(file.mimetype)) return cb(null, false);
      cb(null, true);
    },
  }))
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new InternalServerErrorException('No file uploaded or unsupported file type');
    if (file.size > MAX_SIZE_BYTES) throw new PayloadTooLargeException(`File too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)`);
    if (!file.buffer) {
      throw new InternalServerErrorException('File buffer missing');
    }

    const existing = await this.products.findOne(id).catch(() => null);
    let url: string;

    if (this.storage.isEnabled()) {
      const result = await this.storage.uploadFile(file.buffer, file.originalname, file.mimetype, 'products');
      url = result.url;
      if (existing?.imageUrl) {
        const oldKey = this.extractR2Key(existing.imageUrl);
        if (oldKey) await this.storage.deleteFile(oldKey).catch(() => {});
      }
    } else {
      url = this.saveToLocalDisk(file);
    }

    return this.products.setImage(id, url);
  }

  private saveToLocalDisk(file: Express.Multer.File): string {
    const dir = join(process.cwd(), 'uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${uuid()}${extname(file.originalname)}`;
    writeFileSync(join(dir, filename), file.buffer);
    return `/uploads/${filename}`;
  }

  private extractR2Key(imageUrl: string): string | null {
    if (!imageUrl) return null;
    try {
      const publicUrl =
        (this.storage as any).publicBaseUrl ||
        `https://${(this.storage as any).accountId}.r2.cloudflarestorage.com/${(this.storage as any).bucket}`;
      if (imageUrl.startsWith(publicUrl)) {
        const key = decodeURIComponent(imageUrl.slice(publicUrl.length + 1));
        return key || null;
      }
    } catch {
      /* noop */
    }
    if (imageUrl.startsWith('/uploads/')) {
      const fname = decodeURIComponent(imageUrl.slice('/uploads/'.length));
      return fname ? `products/${fname}` : null;
    }
    return null;
  }
}
