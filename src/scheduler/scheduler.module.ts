import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, GatewayModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
