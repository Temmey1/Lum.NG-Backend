import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() { return this.prisma as any; }

  async get(key: string): Promise<unknown> {
    const row = await this.db.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.setting.findMany();
    return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async setMany(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    await Promise.all(Object.entries(data).map(([k, v]) => this.set(k, v)));
    return this.getAll();
  }
}
