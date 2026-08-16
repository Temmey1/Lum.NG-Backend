import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { v4 as uuid } from 'uuid';

export interface CartSnapshotItem {
  id: number;
  qty: number;
  name: string;
  price: number;
  unit: string;
  pattern: string;
}

@Injectable()
export class CartRecoveryService {
  private readonly logger = new Logger(CartRecoveryService.name);
  private get db() { return this.prisma as any; }

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Called by the frontend every time the cart changes.
   * Upserts an AbandonedCart row keyed on sessionId.
   * If email/name are passed (captured at checkout step 1), they're stored.
   */
  async upsertCart(payload: {
    sessionId: string;
    items: CartSnapshotItem[];
    cartTotal: number;
    email?: string;
    name?: string;
  }): Promise<void> {
    const { sessionId, items, cartTotal, email, name } = payload;

    if (!items.length) {
      // Cart is empty — delete the record so we don't send recovery emails
      await this.db.abandonedCart.deleteMany({ where: { sessionId } });
      return;
    }

    await this.db.abandonedCart.upsert({
      where: { sessionId },
      update: {
        cartSnapshot: items as any,
        cartTotal,
        ...(email && { email }),
        ...(name  && { name }),
        // Reset sent flags if cart changes significantly
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        email:         email ?? null,
        name:          name  ?? null,
        cartSnapshot:  items as any,
        cartTotal,
        recoveryToken: uuid(),
      },
    });
  }

  /**
   * Called when a customer reaches checkout step 1 and enters their details.
   * This is the earliest point we have an email address to send to.
   */
  async attachEmail(sessionId: string, email: string, name: string): Promise<void> {
    await this.db.abandonedCart.updateMany({
      where: { sessionId, recovered: false },
      data: { email, name },
    });
  }

  /**
   * Called when an order is successfully placed.
   * Marks the cart as recovered so no further emails are sent.
   */
  async markRecovered(sessionId: string): Promise<void> {
    await this.db.abandonedCart.updateMany({
      where: { sessionId },
      data: { recovered: true },
    });
    this.logger.log(`Cart recovered for session ${sessionId}`);
  }

  /**
   * Returns the cart snapshot for a recovery token (used by the restore endpoint).
   */
  async getByToken(token: string) {
    return this.db.abandonedCart.findUnique({
      where: { recoveryToken: token },
    });
  }

  // ─── Cron Jobs ─────────────────────────────────────────────

  /**
   * Runs every 5 minutes.
   * Sends the 1-hour reminder to carts that:
   *   - have an email address
   *   - were last updated 60+ minutes ago
   *   - have NOT been recovered
   *   - have NOT had a reminder sent yet
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendOneHourReminders(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const carts = await this.db.abandonedCart.findMany({
      where: {
        email:           { not: null },
        recovered:       false,
        reminderSentAt:  null,
        updatedAt:       { lte: oneHourAgo },
      },
    });

    for (const cart of carts) {
      await this.sendRecoveryEmail(cart, false);
      await this.db.abandonedCart.update({
        where: { id: cart.id },
        data: { reminderSentAt: new Date() },
      });
    }

    if (carts.length) {
      this.logger.log(`Sent 1-hour recovery email to ${carts.length} cart(s)`);
    }
  }

  /**
   * Runs every 5 minutes.
   * Sends the 24-hour follow-up to carts that:
   *   - received the 1-hour reminder
   *   - have NOT been recovered
   *   - reminder was sent 24+ hours ago
   *   - have NOT had a follow-up sent yet
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendTwentyFourHourFollowups(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const carts = await this.db.abandonedCart.findMany({
      where: {
        email:          { not: null },
        recovered:      false,
        reminderSentAt: { not: null, lte: twentyFourHoursAgo },
        followupSentAt: null,
      },
    });

    for (const cart of carts) {
      await this.sendRecoveryEmail(cart, true);
      await this.db.abandonedCart.update({
        where: { id: cart.id },
        data: { followupSentAt: new Date() },
      });
    }

    if (carts.length) {
      this.logger.log(`Sent 24-hour follow-up email to ${carts.length} cart(s)`);
    }
  }

  // ─── Private helpers ────────────────────────────────────────

  private async sendRecoveryEmail(cart: any, isFollowUp: boolean): Promise<void> {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const recoveryUrl = `${appUrl}/shop?restore=${cart.recoveryToken}`;

    const items: CartSnapshotItem[] = Array.isArray(cart.cartSnapshot)
      ? cart.cartSnapshot
      : [];

    await this.emailService.sendCartRecovery({
      to:          cart.email,
      name:        cart.name || '',
      cartItems:   items,
      cartTotal:   cart.cartTotal,
      recoveryUrl,
      isFollowUp,
    });
  }
}
