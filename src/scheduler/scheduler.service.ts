import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PingGateway } from '../gateway/ping.gateway';
import { Monitor } from '../../prisma/generated/prisma';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    // Інжектуємо gateway щоб після кожного пінгу надсилати результат через WebSocket
    private gateway: PingGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pingAllMonitors() {
    const monitors = await this.prisma.monitor.findMany({
      where: { isActive: true },
    });

    const now = new Date();

    await Promise.all(
      monitors
        .filter((m) => {
          // пінгуємо тільки якщо пройшло достатньо часу
          return now.getMinutes() % m.intervalMinutes === 0;
        })
        .map((m) => this.pingMonitor(m)),
    );
  }

  private async pingMonitor(monitor: Monitor) {
    const start = Date.now();
    let isUp = false;
    let statusCode: number | null = null;

    try {
      const response = await fetch(monitor.url, {
        signal: AbortSignal.timeout(10000),
      });
      statusCode = response.status;
      isUp = response.ok;
    } catch {
      isUp = false;
    }

    const responseMs = Date.now() - start;

    const log = await this.prisma.pingLog.create({
      data: { monitorId: monitor.id, statusCode, responseMs, isUp },
    });

    // Після збереження в БД — одразу пушимо результат через WebSocket
    // Всі підключені клієнти отримують оновлення без refresh
    this.gateway.sendMonitorUpdate({
      monitorId: monitor.id,
      isUp,
      responseMs,
      checkedAt: log.checkedAt,
    });

    await this.handleAlert(monitor, isUp);
    this.logger.log(
      `${monitor.url} — ${isUp ? 'UP' : 'DOWN'} (${responseMs}ms)`,
    );
  }

  private async handleAlert(monitor: Monitor, isUp: boolean) {
    const lastAlert = await this.prisma.alert.findFirst({
      where: { monitorId: monitor.id, status: 'open' },
    });

    if (!isUp && !lastAlert) {
      await this.prisma.alert.create({
        data: { monitorId: monitor.id, status: 'open' },
      });
      await this.notifications.sendDownAlert(
        'yyukif69@gmail.com',
        monitor.name,
        monitor.url,
      );
    }

    if (isUp && lastAlert) {
      await this.prisma.alert.update({
        where: { id: lastAlert.id },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      await this.notifications.sendRecoveryAlert(
        'yyukif69@gmail.com',
        monitor.name,
        monitor.url,
      );
    }
  }
}
