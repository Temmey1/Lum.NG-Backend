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

  private normalizeCategory(category?: string | null): string | undefined {
    if (!category) return undefined;
    const trimmed = String(category).trim();
    if (!trimmed) return undefined;
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return slug || trimmed.toLowerCase();
  }

  async create(data: any): Promise<Product> {
    const normalized = { ...data };
    if (data.category !== undefined) normalized.category = this.normalizeCategory(data.category) ?? data.category;
    return (this.prisma as any).product.create({ data: normalized });
  }

  async update(id: number, data: any): Promise<Product> {
    await this.findOne(id);
    const normalized = { ...data };
    if (data.category !== undefined) normalized.category = this.normalizeCategory(data.category) ?? data.category;
    return (this.prisma as any).product.update({ where: { id }, data: normalized });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await (this.prisma as any).product.delete({ where: { id } });
  }

  async setImage(id: number, imageUrl: string): Promise<Product> {
    return this.update(id, { imageUrl });
  }

  async findAllCategories(): Promise<{ value: string; label: string; count: number }[]> {
    const all = await (this.prisma as any).product.findMany({
      select: { category: true },
    });
    const counts = new Map<string, number>();
    for (const p of all) {
      const cat = String(p.category || 'uncategorized').trim() || 'uncategorized';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    const slugToLabel = (slug: string): string => {
      return slug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .trim();
    };
    const result = Array.from(counts.entries()).map(([value, count]) => ({
      value,
      label: slugToLabel(value),
      count,
    }));
    result.sort((a, b) => a.label.localeCompare(b.label));
    return result;
  }
}
