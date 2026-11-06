import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PingGateway } from '../gateway/ping.gateway';
import { Monitor } from '@prisma/client';
import { safeFetch } from '../common/safe-fetch';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: PingGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pingAllMonitors() {
    const monitors = await this.prisma.monitor.findMany({
      where: { isActive: true },
    });

    const now = new Date();
    // Беремо лише монітори, яким зараз час пінгуватись
    const due = monitors.filter(
      (m) => now.getMinutes() % m.intervalMinutes === 0,
    );

    const results = await Promise.allSettled(
      due.map((m) => this.pingMonitor(m)),
    );

    // allSettled не кидає помилок, тому відхилені перевірки логуємо вручну
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.error(
          `Ping failed for monitor ${due[i].id}`,
          r.reason instanceof Error ? r.reason.stack : String(r.reason),
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs() {
    const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.pingLog.deleteMany({
      where: { checkedAt: { lt: cutoff } },
    });
    this.logger.log(`Deleted ${count} old ping logs`);
  }

  private async pingMonitor(monitor: Monitor) {
    const start = Date.now();
    let isUp = false;
    let statusCode: number | null = null;

    try {
      const response = await safeFetch(monitor.url);
      statusCode = response.status;
      isUp = response.ok;
      await response.body?.cancel(); // не вантажимо тіло сторінки
    } catch {
      isUp = false;
    }

    const responseMs = Date.now() - start;

    const log = await this.prisma.pingLog.create({
      data: { monitorId: monitor.id, statusCode, responseMs, isUp },
    });

    this.gateway.sendMonitorUpdate(monitor.userId, {
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

  // Відправка листа, яка не може зламати перевірку: помилку лише логуємо
  private async safeSend(monitorId: string, send: () => Promise<unknown>) {
    try {
      await send();
    } catch (err) {
      this.logger.error(
        `Email failed for monitor ${monitorId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async handleAlert(monitor: Monitor, isUp: boolean) {
    const lastAlert = await this.prisma.alert.findFirst({
      where: { monitorId: monitor.id, status: 'open' },
    });

    // Email власника монітора береться з БД
    const owner = await this.prisma.user.findUnique({
      where: { id: monitor.userId },
      select: { email: true },
    });
    const to = owner?.email;

    if (!isUp && !lastAlert) {
      await this.prisma.alert.create({
        data: { monitorId: monitor.id, status: 'open' },
      });
      if (to) {
        await this.safeSend(monitor.id, () =>
          this.notifications.sendDownAlert(to, monitor.name, monitor.url),
        );
      }
    }

    if (isUp && lastAlert) {
      await this.prisma.alert.update({
        where: { id: lastAlert.id },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      if (to) {
        await this.safeSend(monitor.id, () =>
          this.notifications.sendRecoveryAlert(to, monitor.name, monitor.url),
        );
      }
    }
  }
}
