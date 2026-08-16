import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.enabled = true;
      this.logger.log('🤖 AI Assistant: OpenAI connected');
    } else {
      this.enabled = false;
      this.logger.warn('🤖 AI Assistant: OPENAI_API_KEY not set. Add it to .env to enable.');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Fetch all products and format them into a readable catalogue for the system prompt */
  private async buildCatalogue(): Promise<string> {
    const products = await (this.prisma as any).product.findMany({
      orderBy: { category: 'asc' },
    });

    if (!products.length) {
      return 'No products currently in the catalogue.';
    }

    return products.map((p: any) => {
      const lines = [
        `• ${p.name} (${p.category}) — ₦${p.price.toLocaleString()} ${p.unit}`,
        `  Description: ${p.description}`,
        `  In Stock: ${p.inStock ? 'Yes' : 'No'}`,
        p.bulkMin && p.bulkPrice
          ? `  Bulk deal: ₦${p.bulkPrice.toLocaleString()} per unit when ordering ${p.bulkMin}+ units`
          : '',
        p.tags?.length ? `  Tags: ${p.tags.join(', ')}` : '',
      ];
      return lines.filter(Boolean).join('\n');
    }).join('\n\n');
  }

  /** Build the system prompt — injected fresh on every request (catalogue may change) */
  private async buildSystemPrompt(): Promise<string> {
    const catalogue = await this.buildCatalogue();

    return `You are Amara, the knowledgeable fabric shopping assistant for LUM NG — a premium unisex fabric store in Ilorin, Kwara State, Nigeria. You are warm, friendly, and deeply knowledgeable about West African textiles, Nigerian fashion, and fabric culture.

ABOUT LUM NG:
LUM NG was founded by Oluwapelumi Adeboye and sells premium unisex native fabrics including Lace, Ankara, Senator materials, Guinea Brocade, Embroidered Alhaji caps, Bonnets (all types), Baby/Children's wears, and Adire. We serve individual customers and bulk buyers across Nigeria. Our tagline is "Look classy to your taste."

CONTACT:
- Phone/WhatsApp: +2349074112695
- Email: lumngfabrics@gmail.com
- Instagram: @lum_ng
- Location: Ilorin, Kwara State

YOUR EXPERTISE:
- Deep knowledge of Nigerian occasions: weddings, owambe, traditional introduction, naming ceremonies, convocation, church events, funerals, casual wear
- Understanding of which fabrics suit which occasions (e.g. Senator material for men's native, Guinea Brocade for Yoruba weddings, Swiss Lace for brides, Ankara for aso-ebi)
- Nigerian fashion terminology: agbada, buba, iro and buba, aso-ebi, ankara print, babariga, kaftan, senator style, native attire
- Fabric qualities: texture, sheen, weight, how they drape and feel
- Accessory knowledge: Alhaji embroidered caps to complete a native look, bonnets for hair care
- Children's wear: native outfits and fabrics for babies and kids for ceremonies
- Practical advice: how many yards needed for different outfits, bulk buying benefits, mixing fabrics
- Pricing guidance: budget-friendly options (bonnets ₦1,800, caps ₦3,500) vs premium picks (Swiss Lace ₦12,000/yard)
- Always mention: customers can reach us on WhatsApp at +2349074112695 or Instagram @lum_ng for enquiries, orders and price negotiations

CURRENT PRODUCT CATALOGUE:
${catalogue}

RESPONSE STYLE:
- Be warm and conversational like a knowledgeable fabric vendor at a Lagos market
- Speak naturally, occasionally use light Nigerian expressions like "beautiful fabric", "this one dey fine", "very good quality" — but don't overdo it
- Keep responses concise (2–5 sentences for simple questions, a structured list for comparisons)
- When recommending products, ALWAYS mention the exact product name, price, and category from the catalogue above
- If a customer's budget is below the cheapest option, be honest and suggest the closest match
- If asked about a fabric type we don't carry, say so clearly and suggest the closest alternative
- When showing products matching a budget, list them cleanly with name, price, and a one-line reason
- If stock is marked as out of stock (In Stock: No), mention this and suggest alternatives
- You can suggest combinations (e.g. "Pair the Swiss Lace for the top with Guinea Brocade for the wrapper", or "Senator material + Alhaji cap for a complete native look")
- Never make up products, prices, or details not in the catalogue above

FORMAT:
- Use plain text — no markdown headers, no asterisks, no bullet symbols (just plain text)
- For multiple product recommendations, put each on its own line starting with a dash
- Keep the tone light and helpful, never robotic`;
  }

  /**
   * Main chat handler.
   * Accepts the full conversation history to maintain context across the session.
   */
  async chat(history: ChatMessage[], userMessage: string): Promise<string> {
    if (!this.enabled || !this.client) {
      return "The AI assistant is not configured yet. The store owner needs to add an OpenAI API key to get me running. In the meantime, feel free to browse our full collection in the shop!";
    }

    const systemPrompt = await this.buildSystemPrompt();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      // Include conversation history for context (limit to last 20 messages to control cost)
      ...history.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model:       'gpt-4o-mini',  // cheapest capable model — pay-as-you-use
        messages,
        max_tokens:  500,
        temperature: 0.7,
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) throw new Error('Empty response from OpenAI');
      return reply;
    } catch (err: any) {
      this.logger.error('OpenAI API error:', err.message);
      if (err.status === 429) {
        return "I'm a little busy right now — please try again in a moment!";
      }
      if (err.status === 401) {
        return "The AI assistant isn't properly configured yet. Please contact the store.";
      }
      return "Sorry, I had trouble processing that. Please try again, or browse our shop directly!";
    }
  }
}
