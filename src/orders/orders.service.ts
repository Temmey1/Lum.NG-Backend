import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Order, OrderStatus, DeliveryMode } from '../prisma/generated/types';

export interface CreateOrderDto {
  customer: {
    name: string; email: string; phone: string;
    address?: string; state?: string; landmark?: string; pickupDate?: string;
  };
  items: { id: number; qty: number; selectedImage?: string | null }[];
  delivery: 'delivery' | 'pickup';
  subtotal: number;
  deliveryFee?: number;
  sessionId?: string; // used to mark the abandoned cart as recovered
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private get db() { return this.prisma as any; }

  async findAll(query: { status?: string } = {}) {
    const where: any = {};
    if (query.status) where.status = query.status.toUpperCase();
    return this.db.order.findMany({
      where,
      include: {
        items: { include: { product: { select: { name: true, pattern: true, imageUrl: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ref: string) {
    const order = await this.db.order.findUnique({
      where: { ref },
      include: {
        items: { include: { product: { select: { name: true, pattern: true, imageUrl: true, unit: true } } } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${ref} not found`);
    return order;
  }

  /** Public, unauthenticated lookup for the "view order" link shared with the
   * customer/vendor. Deliberately redacts contact PII (email, phone, full
   * address) — the vendor already receives that via the WhatsApp/Instagram
   * message itself, and there's no need to expose it on an unauthenticated
   * page keyed off a token that could end up shared/forwarded. */
  async findByPublicToken(token: string) {
    const order = await this.db.order.findUnique({
      where: { publicToken: token },
      include: {
        items: { include: { product: { select: { name: true, pattern: true, imageUrl: true, unit: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ref: order.ref,
      firstName: (order.custName || '').split(' ')[0] || 'there',
      delivery: order.delivery,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      items: order.items.map((i: any) => ({
        name: i.product.name,
        pattern: i.product.pattern,
        imageUrl: i.selectedImage || i.product.imageUrl,
        unit: i.product.unit,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
    };
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    if (!dto.customer?.name || !dto.customer?.email || !dto.customer?.phone) {
      throw new BadRequestException('Customer name, email and phone are required');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const productIds = dto.items.map(i => i.id);
    const products = await this.db.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products not found');
    }

    const ref = 'LUMNG-' + Date.now().toString(36).toUpperCase();
    const deliveryFee = dto.deliveryFee ?? 0;

    const order = await this.db.order.create({
      data: {
        ref,
        custName:     dto.customer.name,
        custEmail:    dto.customer.email,
        custPhone:    dto.customer.phone,
        custAddress:  dto.customer.address,
        custState:    dto.customer.state,
        custLandmark: dto.customer.landmark,
        pickupDate:   dto.customer.pickupDate,
        delivery:     dto.delivery === 'pickup' ? 'PICKUP' : 'DELIVERY',
        subtotal:     dto.subtotal,
        deliveryFee,
        total:        dto.subtotal + deliveryFee,
        status:       'PENDING',
        items: {
          create: dto.items.map(item => {
            const product = products.find((p: any) => p.id === item.id);
            const unitPrice = (product.bulkMin && item.qty >= product.bulkMin && product.bulkPrice)
              ? product.bulkPrice
              : product.price;
            return { productId: item.id, qty: item.qty, unitPrice, selectedImage: item.selectedImage || null };
          }),
        },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    // Mark abandoned cart as recovered (non-blocking)
    if (dto.sessionId) {
      this.db.abandonedCart.updateMany({
        where: { sessionId: dto.sessionId },
        data: { recovered: true },
      }).catch(() => {/* silent — cart recovery is best-effort */});
    }

    // Send order confirmation email (non-blocking)
    if (dto.customer.email) {
      const emailItems = order.items.map((i: any) => ({
        id:      i.productId,
        qty:     i.qty,
        name:    i.product.name,
        price:   i.unitPrice,
        unit:    i.product.unit,
        pattern: i.product.pattern,
      }));

      this.email.sendOrderConfirmation({
        to:       dto.customer.email,
        name:     dto.customer.name,
        ref:      order.ref,
        items:    emailItems,
        total:    order.total,
        delivery: order.delivery,
        address:  dto.customer.address,
      }).catch(err => {
        // Log but don't fail the order if email fails
        console.error('Order confirmation email failed:', err.message);
      });
    }

    return order;
  }

  async updateStatus(ref: string, status: string) {
    const valid = Object.values(OrderStatus);
    const upper = status.toUpperCase();
    if (!valid.includes(upper as OrderStatus)) {
      throw new BadRequestException(`Invalid status. Use: ${valid.join(', ')}`);
    }
    await this.findOne(ref);
    return this.db.order.update({ where: { ref }, data: { status: upper } });
  }

  async clearAll(): Promise<void> {
    await this.db.orderItem.deleteMany();
    await this.db.order.deleteMany();
  }

  async stats() {
    const [total, pending, fulfilled, revenue, emails] = await Promise.all([
      this.db.order.count(),
      this.db.order.count({ where: { status: 'PENDING' } }),
      this.db.order.count({ where: { status: 'FULFILLED' } }),
      this.db.order.aggregate({ _sum: { total: true } }),
      this.db.order.findMany({ select: { custEmail: true }, distinct: ['custEmail'] }),
    ]);
    return {
      total,
      pending,
      fulfilled,
      totalRevenue: revenue._sum?.total ?? 0,
      uniqueCustomers: emails.length,
    };
  }
}