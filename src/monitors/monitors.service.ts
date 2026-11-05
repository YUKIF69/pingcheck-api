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

  private async validateUrl(url: string) {
    try {
      await assertPublicUrl(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }

  // Перевіряє ліміти тарифу. Premium проходить без обмежень
  private async assertPlanLimits(
    userId: string,
    intervalMinutes: number,
    checkCount: boolean,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (sub?.plan === 'premium' && sub.status === 'active') return;

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
    return this.prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        pingLogs: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const monitor = await this.prisma.monitor.findUnique({ where: { id } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    if (monitor.userId !== userId) throw new ForbiddenException();
    return monitor;
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

    const logs = await this.prisma.pingLog.findMany({
      where: { monitorId, checkedAt: { gte: month } },
      orderBy: { checkedAt: 'asc' },
    });

    const calcUptime = (from: Date) => {
      const filtered = logs.filter((l) => l.checkedAt >= from);
      if (!filtered.length) return null;
      return Math.round(
        (filtered.filter((l) => l.isUp).length / filtered.length) * 100,
      );
    };

    const [incidents24h, incidents7d, incidents30d] = await Promise.all([
      this.countIncidents(monitorId, day),
      this.countIncidents(monitorId, week),
      this.countIncidents(monitorId, month),
    ]);

    return {
      uptime24h: calcUptime(day),
      uptime7d: calcUptime(week),
      uptime30d: calcUptime(month),
      incidents24h,
      incidents7d,
      incidents30d,
      logs,
    };
  }
}
