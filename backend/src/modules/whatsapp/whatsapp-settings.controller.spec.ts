import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsappSettingsController } from './whatsapp-settings.controller';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappAiService } from './whatsapp-ai.service';

describe('WhatsappSettingsController', () => {
  let controller: WhatsappSettingsController;
  let mockRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  const makeReq = (companyId: string) =>
    ({ user: { companyId, role: 'company_admin', userId: 'u1', email: 'a@b.com' } } as any);

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappSettingsController],
      providers: [
        { provide: getRepositoryToken(WhatsappSettings), useValue: mockRepo },
        { provide: WhatsappAiService, useValue: { clearPromptCache: jest.fn() } },
      ],
    }).compile();

    controller = module.get(WhatsappSettingsController);
  });

  it('GET returns null when no settings row exists', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await controller.getSettings(makeReq('company-1'));
    expect(result).toEqual({ aiPrompt: null });
  });

  it('GET returns stored aiPrompt', async () => {
    mockRepo.findOne.mockResolvedValue({ aiPrompt: 'Be helpful.' });
    const result = await controller.getSettings(makeReq('company-1'));
    expect(result).toEqual({ aiPrompt: 'Be helpful.' });
  });

  it('PATCH saves prompt and returns updated value', async () => {
    mockRepo.save.mockResolvedValue({ aiPrompt: 'New prompt' });
    const result = await controller.updateSettings(makeReq('company-1'), { aiPrompt: 'New prompt' });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', aiPrompt: 'New prompt' }),
    );
    expect(result).toEqual({ aiPrompt: 'New prompt' });
  });

  it('PATCH with null resets to default (null)', async () => {
    mockRepo.save.mockResolvedValue({ aiPrompt: null });
    const result = await controller.updateSettings(makeReq('company-1'), { aiPrompt: null });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', aiPrompt: null }),
    );
    expect(result).toEqual({ aiPrompt: null });
  });

  it('PATCH on second call updates existing row without duplicate key error', async () => {
    const existingRow = { id: 'existing-uuid', companyId: 'company-1', aiPrompt: 'Old prompt' };
    mockRepo.findOne.mockResolvedValue(existingRow);
    mockRepo.save.mockResolvedValue({ ...existingRow, aiPrompt: 'Updated prompt' });

    const result = await controller.updateSettings(makeReq('company-1'), { aiPrompt: 'Updated prompt' });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-uuid', companyId: 'company-1', aiPrompt: 'Updated prompt' }),
    );
    expect(result).toEqual({ aiPrompt: 'Updated prompt' });
  });
});
