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

  /** Keeps `images` (the real, multi-image source of truth) and the legacy
   * single `imageUrl` field in sync, whichever one the caller actually sent.
   * Anything still reading imageUrl (older cached admin/storefront bundles,
   * order-item snapshots, etc.) keeps working without needing every app
   * redeployed in lockstep. */
  private static readonly MAX_IMAGES = 100;

  private syncImageFields(data: any) {
    const out = { ...data };
    if (Array.isArray(out.images)) {
      out.images = out.images
        .filter((u: unknown) => typeof u === 'string' && u.trim())
        .slice(0, ProductsService.MAX_IMAGES);
      out.imageUrl = out.images[0] ?? null;
    } else if (out.imageUrl !== undefined && out.images === undefined) {
      // Old-style single-image write — mirror it into images too so a
      // product added before multi-image support still shows correctly
      // anywhere that now reads `images`.
      out.images = out.imageUrl ? [out.imageUrl] : [];
    }
    return out;
  }

  async create(data: any): Promise<Product> {
    let normalized = this.syncImageFields({ ...data });
    if (data.category !== undefined) normalized.category = this.normalizeCategory(data.category) ?? data.category;
    return (this.prisma as any).product.create({ data: normalized });
  }

  async update(id: number, data: any): Promise<Product> {
    await this.findOne(id);
    let normalized = this.syncImageFields({ ...data });
    if (data.category !== undefined) normalized.category = this.normalizeCategory(data.category) ?? data.category;
    return (this.prisma as any).product.update({ where: { id }, data: normalized });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await (this.prisma as any).product.delete({ where: { id } });
  }

  async setImage(id: number, imageUrl: string): Promise<Product> {
    // This endpoint uploads/replaces ONE image (e.g. a quick single-image
    // edit flow) — treat it as replacing the whole gallery with just that
    // image, since that's what "set the image" means coming from a
    // single-image caller.
    return this.update(id, { images: imageUrl ? [imageUrl] : [] });
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
