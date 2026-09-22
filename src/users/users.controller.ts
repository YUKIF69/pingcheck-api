import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  // Повертає поточний план підписки юзера — free або premium
  @Get('subscription')
  async getSubscription(@GetUser('id') userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    return { plan: sub?.plan ?? 'free', status: sub?.status ?? 'inactive' };
  }
}
