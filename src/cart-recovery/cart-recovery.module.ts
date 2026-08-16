import { Module } from '@nestjs/common';
import { CartRecoveryController } from './cart-recovery.controller';
import { CartRecoveryService } from './cart-recovery.service';

@Module({
  controllers: [CartRecoveryController],
  providers: [CartRecoveryService],
  exports: [CartRecoveryService],
})
export class CartRecoveryModule {}
