import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CartRecoveryService } from './cart-recovery.service';

@Controller('cart-recovery')
export class CartRecoveryController {
  constructor(private readonly service: CartRecoveryService) {}

  /** Frontend calls this every time cart changes */
  @Post('sync')
  syncCart(@Body() body: {
    sessionId: string;
    items: any[];
    cartTotal: number;
    email?: string;
    name?: string;
  }) {
    return this.service.upsertCart(body);
  }

  /** Called when customer enters email at checkout step 1 */
  @Post('attach-email')
  attachEmail(@Body() body: { sessionId: string; email: string; name: string }) {
    return this.service.attachEmail(body.sessionId, body.email, body.name);
  }

  /** Called when order is placed successfully */
  @Post('recovered')
  markRecovered(@Body() body: { sessionId: string }) {
    return this.service.markRecovered(body.sessionId);
  }

  /**
   * Restore endpoint — called when a customer clicks the recovery email link.
   * Returns the cart snapshot so the frontend can repopulate the cart.
   */
  @Get('restore/:token')
  async restoreCart(@Param('token') token: string) {
    const cart = await this.service.getByToken(token);
    if (!cart || cart.recovered) {
      return { success: false, message: 'Cart not found or already completed' };
    }
    return {
      success: true,
      items: cart.cartSnapshot,
      cartTotal: cart.cartTotal,
    };
  }
}
