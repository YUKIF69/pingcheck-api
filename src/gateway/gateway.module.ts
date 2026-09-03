import { Module } from '@nestjs/common';
import { PingGateway } from './ping.gateway';

// Реєструє PingGateway як provider — NestJS сам керує WebSocket сервером
@Module({
  providers: [PingGateway],
  exports: [PingGateway], // експортуємо щоб SchedulerService міг його використовувати
})
export class GatewayModule {}
