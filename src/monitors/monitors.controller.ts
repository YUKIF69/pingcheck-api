import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MonitorsService } from './monitors.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';

@ApiTags('monitors')
@Controller('monitors')
export class MonitorsController {
  constructor(private monitors: MonitorsService) {}

  // Публічний — без guard, стоїть першим
  @Get('public/:slug')
  getPublicMonitor(@Param('slug') slug: string) {
    return this.monitors.getPublicStats(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@GetUser('id') userId: string, @Body() dto: CreateMonitorDto) {
    return this.monitors.create(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@GetUser('id') userId: string) {
    return this.monitors.findAll(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.monitors.findOne(userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/stats')
  getStats(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.monitors.getStats(userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMonitorDto,
  ) {
    return this.monitors.update(userId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.monitors.remove(userId, id);
  }
}
