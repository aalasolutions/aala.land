import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { Role } from '@shared/enums/roles.enum';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let wa: jest.Mocked<WhatsappService>;

  const makeReq = (userId: string, companyId: string) =>
    ({
      user: { userId, companyId, role: Role.COMPANY_ADMIN, email: 'a@b.com' },
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            getConnection: jest.fn(),
            getQR: jest.fn(),
            logout: jest.fn(),
            getChats: jest.fn(),
            getAllMessages: jest.fn(),
            getMessagesForChat: jest.fn(),
            send: jest.fn(),
            sendMedia: jest.fn(),
            typing: jest.fn(),
            getAiConfig: jest.fn(),
            toggleAi: jest.fn(),
            getAiHistory: jest.fn(),
            getMediaDirs: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(WhatsappController);
    wa = module.get(WhatsappService);
  });

  describe('POST ai/toggle', () => {
    it('calls wa.toggleAi with correct params and returns result', async () => {
      wa.toggleAi.mockResolvedValue({ enabled: true } as any);
      const req = makeReq('u1', 'c1');

      const result = await controller.toggleAi(req, { enabled: true });

      expect(wa.toggleAi).toHaveBeenCalledWith('u1', 'c1', true);
      expect(result).toEqual({ enabled: true });
    });

    it('has COMPANY_ADMIN role restriction on toggleAi method', () => {
      const reflector = new Reflector();
      const roles = reflector.get<Role[]>('roles', controller.toggleAi);
      expect(roles).toEqual([Role.COMPANY_ADMIN]);
    });
  });

  describe('GET media/:type/:filename path traversal protection', () => {
    const mockDirs = {
      IMAGE_DIR: '/data/whatsapp/u1/images',
      VIDEO_DIR: '/data/whatsapp/u1/videos',
      AUDIO_DIR: '/data/whatsapp/u1/audio',
      DOCUMENT_DIR: '/data/whatsapp/u1/documents',
    };

    it('returns 403 for path traversal attempt', () => {
      wa.getMediaDirs.mockReturnValue(mockDirs as any);
      const req = makeReq('u1', 'c1');
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        sendFile: jest.fn(),
      } as any;

      controller.serveMedia(req, 'images', '../../../etc/passwd', res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 400 for invalid media type', () => {
      wa.getMediaDirs.mockReturnValue(mockDirs as any);
      const req = makeReq('u1', 'c1');
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        sendFile: jest.fn(),
      } as any;

      controller.serveMedia(req, 'invalid-type', 'file.jpg', res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
