import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// Global щоб можна було інжектити в будь-який модуль без додаткових імпортів
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
