import { Controller, Post, Body, Get } from '@nestjs/common';
import { AiService, ChatMessage } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Health check — lets the frontend know if AI is configured */
  @Get('status')
  status() {
    return { enabled: this.ai.isEnabled };
  }

  /** Main chat endpoint */
  @Post('chat')
  async chat(@Body() body: { history: ChatMessage[]; message: string }) {
    const { history = [], message } = body;

    if (!message?.trim()) {
      return { reply: "Please type a message so I can help you!" };
    }

    const reply = await this.ai.chat(history, message.trim());
    return { reply };
  }
}
