import { ForbiddenException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';

describe('MonitorsService: plan limits and ownership', () => {
  const findSubscription = jest.fn();
  const countMonitors = jest.fn();
  const createMonitor = jest.fn();
  const findMonitor = jest.fn();
  const updateMonitor = jest.fn();

  // Мок Prisma: лише методи, які використовує сервіс
  const prisma = {
    subscription: { findUnique: findSubscription },
    monitor: {
      count: countMonitors,
      create: createMonitor,
      findUnique: findMonitor,
      update: updateMonitor,
    },
  } as unknown as PrismaService;

  const service = new MonitorsService(prisma);
  const dto = (over: Partial<CreateMonitorDto> = {}) =>
    ({
      name: 'Site',
      url: 'http://8.8.8.8',
      intervalMinutes: 5,
      ...over,
    }) as CreateMonitorDto;

  beforeEach(() => {
    jest.resetAllMocks();
    createMonitor.mockResolvedValue({});
    updateMonitor.mockResolvedValue({});
  });

  it('free: blocks the 4th monitor', async () => {
    findSubscription.mockResolvedValue(null);
    countMonitors.mockResolvedValue(3);
    await expect(service.create('u1', dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(createMonitor).not.toHaveBeenCalled();
  });

  it('free: blocks an interval under 5 minutes', async () => {
    findSubscription.mockResolvedValue(null);
    countMonitors.mockResolvedValue(0);
    await expect(
      service.create('u1', dto({ intervalMinutes: 1 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('free: allows creating within the limits', async () => {
    findSubscription.mockResolvedValue(null);
    countMonitors.mockResolvedValue(2);
    await service.create('u1', dto());
    expect(createMonitor).toHaveBeenCalledTimes(1);
  });

  it('premium: has no limits', async () => {
    findSubscription.mockResolvedValue({ plan: 'premium' });
    countMonitors.mockResolvedValue(50);
    await service.create('u1', dto({ intervalMinutes: 1 }));
    expect(createMonitor).toHaveBeenCalledTimes(1);
  });

  it('update: free user can still change the slug of a 1-minute monitor', async () => {
    findMonitor.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      intervalMinutes: 1,
    });
    findSubscription.mockResolvedValue(null);
    await service.update('u1', 'm1', { slug: 'x', intervalMinutes: 1 });
    expect(updateMonitor).toHaveBeenCalledTimes(1);
  });

  it('update: free user cannot switch to a 1-minute interval', async () => {
    findMonitor.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      intervalMinutes: 5,
    });
    findSubscription.mockResolvedValue(null);
    await expect(
      service.update('u1', 'm1', { intervalMinutes: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("findOne: another user cannot read someone else's monitor", async () => {
    findMonitor.mockResolvedValue({ id: 'm1', userId: 'owner' });
    await expect(service.findOne('intruder', 'm1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
