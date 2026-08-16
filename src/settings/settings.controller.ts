import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll(): Promise<Record<string, unknown>> {
    return this.settings.getAll();
  }

  @Get(':key')
  getOne(@Param('key') key: string): Promise<unknown> {
    return this.settings.get(key);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  updateMany(@Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.settings.setMany(body);
  }

  @Post(':key')
  @UseGuards(JwtAuthGuard)
  setOne(@Param('key') key: string, @Body('value') value: unknown): Promise<void> {
    return this.settings.set(key, value);
  }
}
