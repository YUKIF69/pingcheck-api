import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';

@Injectable()
export class MonitorsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateMonitorDto) {
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
        // Включаємо тільки останній pingLog для кожного монітора
        pingLogs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
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
    await this.findOne(userId, id);
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

    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const logs = await this.prisma.pingLog.findMany({
      where: { monitorId: monitor.id, checkedAt: { gte: month } },
      orderBy: { checkedAt: 'asc' },
    });

    const calcUptime = (from: Date) => {
      const filtered = logs.filter((l) => l.checkedAt >= from);
      if (!filtered.length) return null;
      return Math.round(
        (filtered.filter((l) => l.isUp).length / filtered.length) * 100,
      );
    };

    return {
      monitor: {
        name: monitor.name,
        url: monitor.url,
        intervalMinutes: monitor.intervalMinutes,
      },
      uptime24h: calcUptime(day),
      uptime7d: calcUptime(week),
      uptime30d: calcUptime(month),
      incidents24h: logs.filter((l) => l.checkedAt >= day && !l.isUp).length,
      incidents7d: logs.filter((l) => l.checkedAt >= week && !l.isUp).length,
      incidents30d: logs.filter((l) => !l.isUp).length,
      logs,
    };
  }

  async getStats(userId: string, id: string) {
    await this.findOne(userId, id); // перевірка що монітор належить юзеру

    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monitor = await this.findOne(userId, id);

    // Всі логи за 30 днів для графіка
    const logs = await this.prisma.pingLog.findMany({
      where: { monitorId: id, checkedAt: { gte: month } },
      orderBy: { checkedAt: 'asc' },
    });

    const calcUptime = (from: Date) => {
      const filtered = logs.filter((l) => l.checkedAt >= from);
      if (!filtered.length) return null;
      return Math.round(
        (filtered.filter((l) => l.isUp).length / filtered.length) * 100,
      );
    };

    // Кількість падінь за 24h
    const incidents24h = logs.filter(
      (l) => l.checkedAt >= day && !l.isUp,
    ).length;
    const incidents7d = logs.filter(
      (l) => l.checkedAt >= week && !l.isUp,
    ).length;
    const incidents30d = logs.filter((l) => !l.isUp).length; // вже за 30д

    return {
      monitor,
      uptime24h: calcUptime(day),
      uptime7d: calcUptime(week),
      uptime30d: calcUptime(month),
      incidents24h,
      incidents7d,
      incidents30d,
      logs, // для графіка
    };
  }
}
