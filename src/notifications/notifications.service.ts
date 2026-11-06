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

  esc = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );

  private recipient(to: string) {
    return this.config.get<string>('ALERT_EMAIL_OVERRIDE') ?? to;
  }

  // Надсилає email коли сайт впав
  async sendDownAlert(to: string, monitorName: string, url: string) {
    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('RESEND_FROM'),
      to: this.recipient(to),
      subject: `🔴 ${monitorName} is DOWN`,
      html: `
        <h2>Your monitor is down</h2>
        <p><strong>${this.esc(monitorName)}</strong> (${this.esc(url)}) is not responding.</p>
        <p>We'll notify you when it recovers.</p>
      `,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    this.logger.warn(`Down alert sent to ${to} for ${monitorName}`);
  }

  // Надсилає email коли сайт відновився
  async sendRecoveryAlert(to: string, monitorName: string, url: string) {
    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('RESEND_FROM'),
      to: this.recipient(to),
      subject: `🟢 ${monitorName} is back UP`,
      html: `
        <h2>Your monitor recovered</h2>
        <p><strong>${this.esc(monitorName)}</strong> (${this.esc(url)}) is not responding.</p>
      `,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    this.logger.log(`Recovery alert sent to ${to} for ${monitorName}`);
  }
}
