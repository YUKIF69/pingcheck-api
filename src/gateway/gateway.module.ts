import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PingGateway } from './ping.gateway';

@Module({
  imports: [AuthModule],
  providers: [PingGateway],
  exports: [PingGateway],
})
export class GatewayModule {}
