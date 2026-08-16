import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface CartItem {
  id: number;
  qty: number;
  name: string;
  price: number;
  unit: string;
  pattern: string;
}

export interface AbandonedCartEmailPayload {
  to: string;
  name: string;
  cartItems: CartItem[];
  cartTotal: number;
  recoveryUrl: string;
  isFollowUp: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly appUrl: string;
  private readonly enabled: boolean;

  constructor() {
    this.fromEmail = process.env.FROM_EMAIL || 'orders@lumng.com';
    this.fromName  = process.env.FROM_NAME  || 'LUMNG Fabrics';
    this.appUrl    = process.env.APP_URL    || 'http://localhost:5173';

    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.enabled = true;
      this.logger.log('📧 Email: Resend transport active');
    } else {
      this.resend = null;
      this.enabled = false;
      this.logger.warn('📧 Email: No RESEND_API_KEY set. Add it to .env to enable emails.');
    }
  }

  /** Send a raw email — used internally */
  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.enabled || !this.resend) {
      this.logger.debug(`[Email disabled] Would send to ${to}: ${subject}`);
      return false;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`📧 Email failed → ${to}: ${error.message}`);
        return false;
      }
      this.logger.log(`📧 Email sent → ${to} | ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(`📧 Email failed → ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Abandoned cart recovery email */
  async sendCartRecovery(payload: AbandonedCartEmailPayload): Promise<boolean> {
    const { to, name, cartItems, cartTotal, recoveryUrl, isFollowUp } = payload;

    const subject = isFollowUp
      ? `${name ? name.split(' ')[0] + ', your' : 'Your'} fabrics are still waiting 🌍`
      : `You left something beautiful behind — LUMNG`;

    const itemRows = cartItems.map(item => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;">
          <strong style="color:#ffffff;font-size:14px;">${item.name}</strong><br/>
          <span style="color:#888;font-size:12px;text-transform:capitalize;">${item.qty} × ${item.unit}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;text-align:right;color:#e8c97a;font-size:14px;white-space:nowrap;">
          ₦${(item.price * item.qty).toLocaleString('en-NG')}
        </td>
      </tr>
    `).join('');

    const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hello,';

    const headline = isFollowUp
      ? 'Still thinking about it?'
      : 'You left some fabrics in your cart';

    const body = isFollowUp
      ? `This is a gentle reminder that the fabrics you selected are still available. Fabric quality like this doesn't stay for long — especially during peak season.`
      : `No rush — but we wanted to make sure you didn't forget about the beautiful fabrics you selected. Your cart is saved and ready whenever you are.`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#111111;border:1px solid #222;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1200,#2d2000);padding:36px 40px;text-align:center;border-bottom:1px solid #2a2a2a;">
            <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:0.15em;color:#e8c97a;">LUMNG</div>
            <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;margin-top:6px;">Native Luxury Fabrics</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="color:#aaa;font-size:15px;margin:0 0 6px;">${greeting}</p>
            <h2 style="color:#ffffff;font-family:Georgia,serif;font-size:22px;font-weight:700;margin:0 0 16px;">${headline}</h2>
            <p style="color:#888;font-size:14px;line-height:1.7;margin:0 0 28px;">${body}</p>

            <!-- Cart items table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <thead>
                <tr style="background:#1a1a1a;">
                  <th style="padding:10px 16px;text-align:left;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;font-weight:600;">Fabric</th>
                  <th style="padding:10px 16px;text-align:right;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;font-weight:600;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
              <tfoot>
                <tr style="background:#1a1a1a;">
                  <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:15px;">Order Total</td>
                  <td style="padding:14px 16px;text-align:right;color:#e8c97a;font-weight:700;font-size:17px;">
                    ₦${cartTotal.toLocaleString('en-NG')}
                  </td>
                </tr>
              </tfoot>
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${recoveryUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c97a);color:#080808;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;padding:16px 40px;border-radius:6px;">
                Complete My Order →
              </a>
            </div>

            <p style="color:#555;font-size:12px;line-height:1.6;text-align:center;margin:0;">
              This link restores your exact cart. No account needed.<br/>
              If you have already completed this order, please ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #2a2a2a;text-align:center;">
            <p style="color:#444;font-size:12px;margin:0 0 6px;">LUM NG — Unisex Fabric Store, Ilorin, Kwara State</p>
            <p style="color:#333;font-size:11px;margin:0;">
              Questions? Reply to this email or WhatsApp us at ${process.env.CONTACT_PHONE || '+2349074112695'}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return this.send(to, subject, html);
  }

  /** Order confirmation email */
  async sendOrderConfirmation(payload: {
    to: string;
    name: string;
    ref: string;
    items: CartItem[];
    total: number;
    delivery: string;
    address?: string;
  }): Promise<boolean> {
    const { to, name, ref, items, total, delivery, address } = payload;

    const itemRows = items.map(item => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;">
          <strong style="color:#ffffff;font-size:14px;">${item.name}</strong><br/>
          <span style="color:#888;font-size:12px;">${item.qty} × ${item.unit}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;text-align:right;color:#e8c97a;font-size:14px;">
          ₦${(item.price * item.qty).toLocaleString('en-NG')}
        </td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080808;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#1a1200,#2d2000);padding:36px 40px;text-align:center;border-bottom:1px solid #2a2a2a;">
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:0.15em;color:#e8c97a;">LUMNG</div>
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;margin-top:6px;">Order Confirmed ✓</div>
      </td></tr>
      <tr><td style="padding:36px 40px;">
        <p style="color:#aaa;font-size:15px;margin:0 0 6px;">Hi ${name ? name.split(' ')[0] : 'there'},</p>
        <h2 style="color:#fff;font-family:Georgia,serif;font-size:22px;margin:0 0 16px;">Your order has been placed!</h2>
        <p style="color:#888;font-size:14px;line-height:1.7;margin:0 0 20px;">
          We've received your order and will be in touch within <strong style="color:#e8c97a;">24 hours</strong> to confirm and arrange payment.
        </p>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:14px 20px;margin-bottom:24px;">
          <span style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;">Order Reference</span><br/>
          <span style="font-family:monospace;font-size:17px;color:#e8c97a;letter-spacing:0.1em;">${ref}</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <thead><tr style="background:#1a1a1a;">
            <th style="padding:10px 16px;text-align:left;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;">Fabric</th>
            <th style="padding:10px 16px;text-align:right;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#c9a84c;">Total</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr style="background:#1a1a1a;">
            <td style="padding:14px 16px;color:#fff;font-weight:700;">Total</td>
            <td style="padding:14px 16px;text-align:right;color:#e8c97a;font-weight:700;font-size:17px;">₦${total.toLocaleString('en-NG')}</td>
          </tr></tfoot>
        </table>
        <p style="color:#888;font-size:13px;margin:0;">
          <strong style="color:#fff;">Delivery:</strong> ${delivery === 'PICKUP' ? 'Store Pickup — Ilorin, Kwara State' : `Home Delivery${address ? ` to ${address}` : ''}`}
        </p>
      </td></tr>
      <tr><td style="padding:24px 40px;border-top:1px solid #2a2a2a;text-align:center;">
        <p style="color:#444;font-size:12px;margin:0;">LUM NG — Unisex Fabric Store, Ilorin, Kwara State</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    return this.send(to, `Order Confirmed — ${ref} | LUMNG`, html);
  }
}
