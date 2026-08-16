import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { UploadModule } from './upload/upload.module';
import { SettingsModule } from './settings/settings.module';
import { EmailModule } from './email/email.module';
import { CartRecoveryModule } from './cart-recovery/cart-recovery.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),                    // enables @Cron decorators
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,          // global — PrismaService injected everywhere
    EmailModule,           // global — EmailService injected everywhere
    AuthModule,
    ProductsModule,
    OrdersModule,
    UploadModule,
    SettingsModule,
    CartRecoveryModule,    // Feature 2: abandoned cart recovery + cron
    AiModule,              // Feature 1: AI shopping assistant
  ],
})
export class AppModule {}
