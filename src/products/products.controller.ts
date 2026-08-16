import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards,
  UseInterceptors, UploadedFile, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { existsSync, mkdirSync } from 'fs';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

const multerStorage = diskStorage({
  destination: (req, file, cb) => {
    const dir = join(process.cwd(), 'uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
});

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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
    await this.products.remove(id);
    return { success: true };
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', { storage: multerStorage }))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const imageUrl = `/uploads/${file.filename}`;
    return this.products.setImage(id, imageUrl);
  }
}
