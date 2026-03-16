import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage, MessageDirection, MessageStatus } from './entities/whatsapp-message.entity';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
  ) { }

  async sendMessage(companyId: string, dto: SendMessageDto): Promise<WhatsappMessage> {
    const record = this.messageRepository.create({
      companyId,
      phoneNumber: dto.phoneNumber,
      message: dto.message,
      leadId: dto.leadId ?? null,
      mediaUrl: dto.mediaUrl ?? null,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
    });

    const saved = await this.messageRepository.save(record);

    try {
      await this.dispatchToWhatsAppApi(dto.phoneNumber, dto.message, dto.mediaUrl);
      saved.status = MessageStatus.SENT;
      await this.messageRepository.save(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp dispatch failed for ${dto.phoneNumber}: ${message}`);
      saved.status = MessageStatus.FAILED;
      await this.messageRepository.save(saved);
    }

    return saved;
  }

  async handleWebhook(companyId: string, payload: Record<string, unknown>): Promise<{ received: boolean }> {
    try {
      const entry = payload['entry'] as Record<string, unknown>[] | undefined;
      if (!entry?.length) {
        return { received: true };
      }

      for (const item of entry) {
        const changes = item['changes'] as Record<string, unknown>[] | undefined;
        if (!changes?.length) continue;

        for (const change of changes) {
          const value = change['value'] as Record<string, unknown> | undefined;
          const messages = value?.['messages'] as Record<string, unknown>[] | undefined;
          if (!messages?.length) continue;

          for (const msg of messages) {
            const phone = msg['from'] as string | undefined;
            const text = (msg['text'] as Record<string, unknown> | undefined)?.['body'] as string | undefined;
            const wamid = msg['id'] as string | undefined;

            if (phone && text) {
              const record = this.messageRepository.create({
                companyId,
                phoneNumber: phone,
                message: text,
                direction: MessageDirection.INBOUND,
                status: MessageStatus.DELIVERED,
                externalId: wamid ?? null,
                leadId: null,
                mediaUrl: null,
              });
              await this.messageRepository.save(record);
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook processing error: ${message}`);
    }

    return { received: true };
  }

  async findMessages(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: WhatsappMessage[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.messageRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findMessagesByLead(
    leadId: string,
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: WhatsappMessage[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.messageRepository.findAndCount({
      where: { leadId, companyId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<WhatsappMessage> {
    const msg = await this.messageRepository.findOne({ where: { id, companyId } });
    if (!msg) {
      throw new NotFoundException('WhatsApp message not found');
    }
    return msg;
  }

  private async dispatchToWhatsAppApi(phone: string, message: string, mediaUrl?: string): Promise<void> {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      this.logger.warn('WhatsApp API credentials not configured. Message stored but not sent.');
      return;
    }

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    };

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`WhatsApp API error: ${err}`);
    }
  }
}
