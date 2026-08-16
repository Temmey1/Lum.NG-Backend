import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: any) {
    const list = await this.orders.findAll(query);
    return { orders: list, total: list.length };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  stats() { return this.orders.stats(); }

  @Get(':ref')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('ref') ref: string) { return this.orders.findOne(ref); }

  @Post()
  create(@Body() body: any) { return this.orders.create(body); }

  @Patch(':ref/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(@Param('ref') ref: string, @Body('status') status: string) {
    return this.orders.updateStatus(ref, status);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  async clearAll() {
    await this.orders.clearAll();
    return { success: true, message: 'All orders cleared' };
  }
}
