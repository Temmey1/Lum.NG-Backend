import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Product, Prisma } from '../prisma/generated/types';

export interface ProductFilters {
  category?: string;
  inStock?: string;
  featured?: string;
  sort?: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: ProductFilters = {}): Promise<Product[]> {
    const where: any = {};
    if (filters.category && filters.category !== 'all') where.category = filters.category;
    if (filters.inStock === 'true') where.inStock = true;
    if (filters.featured === 'true') where.featured = true;

    let orderBy: any = { createdAt: 'asc' };
    if (filters.sort === 'price-asc')  orderBy = { price: 'asc' };
    if (filters.sort === 'price-desc') orderBy = { price: 'desc' };
    if (filters.sort === 'name')       orderBy = { name: 'asc' };

    return (this.prisma as any).product.findMany({ where, orderBy });
  }

  async findOne(id: number): Promise<Product> {
    const product = await (this.prisma as any).product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return product;
  }

  async create(data: any): Promise<Product> {
    return (this.prisma as any).product.create({ data });
  }

  async update(id: number, data: any): Promise<Product> {
    await this.findOne(id);
    return (this.prisma as any).product.update({ where: { id }, data });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await (this.prisma as any).product.delete({ where: { id } });
  }

  async setImage(id: number, imageUrl: string): Promise<Product> {
    return this.update(id, { imageUrl });
  }
}
