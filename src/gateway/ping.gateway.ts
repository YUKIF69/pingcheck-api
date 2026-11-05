import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL ?? 'https://pingcheck-web.vercel.app',
      'http://localhost:3000',
    ],
  },
})
export class PingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PingGateway.name);

  constructor(private jwt: JwtService) {}

  // Перевіряємо JWT при підключенні і кладемо сокет у кімнату власника
  async handleConnection(client: Socket) {
    const { token } = client.handshake.auth as { token?: string };
    try {
      const payload = this.jwt.verify<{ sub: string }>(token ?? '');
      await client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id}`);
    } catch {
      client.disconnect(true); // без валідного токена не підключаємо
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Подія летить лише власнику монітора, а не всім клієнтам
  sendMonitorUpdate(
    userId: string,
    data: {
      monitorId: string;
      isUp: boolean;
      responseMs: number;
      checkedAt: Date;
    },
  ) {
    this.server.to(`user:${userId}`).emit('monitor.updated', data);
  }
}
