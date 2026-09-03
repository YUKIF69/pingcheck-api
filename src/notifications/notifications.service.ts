import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  private resend: Resend;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private config: ConfigService) {
    // Ініціалізуємо Resend клієнт з API ключем з .env
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
  }

  // Надсилає email коли сайт впав
  async sendDownAlert(to: string, monitorName: string, url: string) {
    await this.resend.emails.send({
      from: this.config.getOrThrow<string>('RESEND_FROM'),
      to,
      subject: `🔴 ${monitorName} is DOWN`,
      html: `
        <h2>Your monitor is down</h2>
        <p><strong>${monitorName}</strong> (${url}) is not responding.</p>
        <p>We'll notify you when it recovers.</p>
      `,
    });
    this.logger.warn(`Down alert sent to ${to} for ${monitorName}`);
  }

  // Надсилає email коли сайт відновився
  async sendRecoveryAlert(to: string, monitorName: string, url: string) {
    await this.resend.emails.send({
      from: this.config.getOrThrow<string>('RESEND_FROM'),
      to,
      subject: `🟢 ${monitorName} is back UP`,
      html: `
        <h2>Your monitor recovered</h2>
        <p><strong>${monitorName}</strong> (${url}) is responding again.</p>
      `,
    });
    this.logger.log(`Recovery alert sent to ${to} for ${monitorName}`);
  }
}
