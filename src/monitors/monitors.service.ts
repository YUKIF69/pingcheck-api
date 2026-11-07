import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { assertPublicUrl, UnsafeUrlError } from '../common/safe-fetch';

const FREE_MAX_MONITORS = 3;
const FREE_MIN_INTERVAL_MINUTES = 5;

@Injectable()
export class MonitorsService {
  constructor(private prisma: PrismaService) {}

  // Перевіряє ліміти тарифу. Premium проходить без обмежень
  private async assertPlanLimits(
    userId: string,
    intervalMinutes: number,
    checkCount: boolean,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (sub?.plan === 'premium') return;

    if (intervalMinutes < FREE_MIN_INTERVAL_MINUTES) {
      throw new ForbiddenException('Free plan: minimum interval is 5 minutes');
    }
    if (checkCount) {
      const count = await this.prisma.monitor.count({ where: { userId } });
      if (count >= FREE_MAX_MONITORS) {
        throw new ForbiddenException('Free plan: up to 3 monitors');
      }
    }
  }

  // Рахує інциденти (записи Alert) від вказаної дати, а не окремі невдалі пінги
  private countIncidents(monitorId: string, since: Date) {
    return this.prisma.alert.count({
      where: { monitorId, firedAt: { gte: since } },
    });
  }

  async create(userId: string, dto: CreateMonitorDto) {
    await this.validateUrl(dto.url);
    await this.assertPlanLimits(userId, dto.intervalMinutes ?? 5, true);
    return this.prisma.monitor.create({
      data: {
        userId,
        name: dto.name,
        url: dto.url,
        intervalMinutes: dto.intervalMinutes ?? 5,
        isPublic: dto.isPublic ?? false,
        slug: dto.slug,
      },
    });
  }

  async findAll(userId: string) {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      // 30 останніх пінгів для міні-графіка на картці
      include: { pingLogs: { orderBy: { checkedAt: 'desc' }, take: 30 } },
    });

    // Реальний uptime за 24h рахуємо в БД двома агрегатними запитами на всі монітори одразу
    const ids = monitors.map((m) => m.id);
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const where = { monitorId: { in: ids }, checkedAt: { gte: day } };
    const [totals, ups] = await Promise.all([
      this.prisma.pingLog.groupBy({
        by: ['monitorId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.pingLog.groupBy({
        by: ['monitorId'],
        where: { ...where, isUp: true },
        _count: { _all: true },
      }),
    ]);
    const totalBy = new Map(totals.map((t) => [t.monitorId, t._count._all]));
    const upBy = new Map(ups.map((u) => [u.monitorId, u._count._all]));

    return monitors.map((m) => {
      const total = totalBy.get(m.id) ?? 0;
      const up = upBy.get(m.id) ?? 0;
      return { ...m, uptime24h: total ? Math.round((up / total) * 100) : null };
    });
  }

  async findOne(userId: string, id: string) {
    const monitor = await this.prisma.monitor.findUnique({ where: { id } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    if (monitor.userId !== userId) throw new ForbiddenException();
    return monitor;
  }

  private async validateUrl(url: string) {
    try {
      await assertPublicUrl(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }

  async update(userId: string, id: string, dto: UpdateMonitorDto) {
    if (dto.url) await this.validateUrl(dto.url);
    const monitor = await this.findOne(userId, id);
    if (
      dto.intervalMinutes !== undefined &&
      dto.intervalMinutes !== monitor.intervalMinutes
    ) {
      await this.assertPlanLimits(userId, dto.intervalMinutes, false);
    }
    return this.prisma.monitor.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.monitor.delete({ where: { id } });
  }

  async getPublicStats(slug: string) {
    const monitor = await this.prisma.monitor.findUnique({ where: { slug } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    if (!monitor.isPublic)
      throw new ForbiddenException('This monitor is not public');

    const stats = await this.buildStats(monitor.id);
    return {
      monitor: {
        name: monitor.name,
        url: monitor.url,
        intervalMinutes: monitor.intervalMinutes,
      },
      ...stats,
    };
  }

  async getStats(userId: string, id: string) {
    const monitor = await this.findOne(userId, id);
    const stats = await this.buildStats(id);
    return { monitor, ...stats };
  }

  // Спільна логіка статистики для приватної та публічної сторінок
  private async buildStats(monitorId: string) {
    const now = Date.now();
    const day = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [counts, buckets, last] = await Promise.all([
      // Один запит рахує і total, і up одразу для трьох періодів
      this.prisma.$queryRaw<
        {
          t24: number;
          u24: number;
          t7: number;
          u7: number;
          t30: number;
          u30: number;
        }[]
      >`
      SELECT
        COUNT(*) FILTER (WHERE "checkedAt" >= ${day})::int AS t24,
        COUNT(*) FILTER (WHERE "checkedAt" >= ${day} AND "isUp")::int AS u24,
        COUNT(*) FILTER (WHERE "checkedAt" >= ${week})::int AS t7,
        COUNT(*) FILTER (WHERE "checkedAt" >= ${week} AND "isUp")::int AS u7,
        COUNT(*)::int AS t30,
        COUNT(*) FILTER (WHERE "isUp")::int AS u30
      FROM "PingLog"
      WHERE "monitorId" = ${monitorId} AND "checkedAt" >= ${month}`,
      // Групуємо пінги по годинах: ~720 точок за 30 днів замість десятків тисяч
      this.prisma.$queryRaw<
        { bucket: Date; avgMs: number; total: number; up: number }[]
      >`
      SELECT date_trunc('hour', "checkedAt") AS bucket,
             AVG("responseMs")::int AS "avgMs",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE "isUp")::int AS up
      FROM "PingLog"
      WHERE "monitorId" = ${monitorId} AND "checkedAt" >= ${month}
      GROUP BY bucket ORDER BY bucket`,
      this.prisma.pingLog.findFirst({
        where: { monitorId },
        orderBy: { checkedAt: 'desc' },
      }),
    ]);

    const c = counts[0];
    const pct = (up: number, total: number) =>
      total ? Math.round((up / total) * 100) : null;

    const [incidents24h, incidents7d, incidents30d] = await Promise.all([
      this.countIncidents(monitorId, day),
      this.countIncidents(monitorId, week),
      this.countIncidents(monitorId, month),
    ]);

    return {
      uptime24h: pct(c.u24, c.t24),
      uptime7d: pct(c.u7, c.t7),
      uptime30d: pct(c.u30, c.t30),
      incidents24h,
      incidents7d,
      incidents30d,
      // Остання перевірка для статусу; null, якщо пінгів ще не було
      lastCheck: last
        ? {
            isUp: last.isUp,
            responseMs: last.responseMs,
            checkedAt: last.checkedAt,
          }
        : null,
      // Смужка "Last 24h": одна година дорівнює одному бару, червоний, якщо в цю годину були падіння
      bars24h: buckets
        .filter((b) => b.bucket >= day)
        .map((b) => ({ isUp: b.up === b.total })),
      // Точки для графіка (годинні середні)
      chart: buckets.map((b) => ({
        checkedAt: b.bucket.toISOString(),
        responseMs: b.avgMs,
        isUp: b.up > 0,
      })),
    };
  }
}
