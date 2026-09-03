import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// @WebSocketGateway відкриває WebSocket сервер на тому самому порту що і HTTP
// cors дозволяє підключення з фронтенду на localhost:3000
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000' },
})
export class PingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // Server — це socket.io сервер через який надсилаємо події всім клієнтам
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PingGateway.name);

  // Викликається автоматично коли браузер підключається
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  // Викликається автоматично коли браузер відключається
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Цей метод викликає SchedulerService після кожного пінгу
  // Надсилає подію 'monitor.updated' всім підключеним клієнтам
  sendMonitorUpdate(data: {
    monitorId: string;
    isUp: boolean;
    responseMs: number;
    checkedAt: Date;
  }) {
    this.server.emit('monitor.updated', data);
  }
}
