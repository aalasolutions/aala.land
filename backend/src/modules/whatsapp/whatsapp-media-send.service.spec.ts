import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { ReadStream, existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileTypeFromFile } from 'file-type';
import {
  releaseStorage,
  reserveStorage,
} from '@shared/utils/storage-quota.util';
import { verifyTextFile } from '@shared/utils/text-file.util';
import { Role } from '@shared/enums/roles.enum';
import { WhatsappMediaSendService } from './whatsapp-media-send.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { GRAPH_VERSION, WaMediaStatus } from './wa-types';

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn((input) => input),
}));

interface MockUpload {
  params: {
    Bucket: string;
    Key: string;
    Body: ReadStream;
    ContentType: string;
    CacheControl: string;
  };
  partSize: number;
  queueSize: number;
  received?: Buffer;
}
const mockUploads: MockUpload[] = [];
let mockUploadFailure: Error | null = null;

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((opts) => {
    const record = { ...opts } as MockUpload & {
      params: { Body: AsyncIterable<Buffer> };
    };
    mockUploads.push(record);
    return {
      done: async () => {
        if (mockUploadFailure) throw mockUploadFailure;
        const chunks: Buffer[] = [];
        for await (const chunk of record.params.Body) chunks.push(chunk);
        record.received = Buffer.concat(chunks);
        return {};
      },
    };
  }),
}));

jest.mock('@shared/utils/storage-quota.util', () => ({
  reserveStorage: jest.fn().mockResolvedValue(undefined),
  releaseStorage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@shared/utils/text-file.util', () => ({
  verifyTextFile: jest.fn().mockResolvedValue(undefined),
}));

const MB = 1024 * 1024;
const MEDIA_URL = `https://graph.facebook.com/${GRAPH_VERSION}/pnid-1/media`;
const MESSAGES_URL = `https://graph.facebook.com/${GRAPH_VERSION}/pnid-1/messages`;

const connection = {
  id: 'conn-1',
  companyId: 'company-1',
  userId: 'user-1',
  phoneNumberId: 'pnid-1',
  displayPhoneNumber: '+1111111111',
  accessTokenCiphertext: 'cipher',
};

function webp(chunks: string[]): Buffer {
  const body = Buffer.concat(
    chunks.map((fourCc) => {
      const header = Buffer.alloc(8);
      header.write(fourCc, 0, 'latin1');
      header.writeUInt32LE(10, 4);
      return Buffer.concat([header, Buffer.alloc(10)]);
    }),
  );
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body]);
}

describe('WhatsappMediaSendService', () => {
  let service: WhatsappMediaSendService;
  let dir: string;
  let chats: { findOne: jest.Mock };
  let store: {
    addMessage: jest.Mock;
    findRowByUuid: jest.Mock;
    claimFailedLocalRow: jest.Mock;
    promoteLocalRow: jest.Mock;
    markLocalRowFailed: jest.Mock;
    getMessageByUuid: jest.Mock;
  };
  let ai: { recordHumanReply: jest.Mock };
  let gateway: { emitMessage: jest.Mock; emitMessageUpdate: jest.Mock };
  let fetchMock: jest.Mock;
  let sendResponse: () => Response;
  const originalEnv = process.env;

  const upload = async (
    name: string,
    size: number,
    content: Buffer = Buffer.from('file bytes'),
  ): Promise<Express.Multer.File> => {
    const path = join(dir, `upload-${Math.random().toString(36).slice(2)}`);
    await writeFile(path, content);
    return {
      path,
      originalname: name,
      size,
      mimetype: 'x/y',
    } as Express.Multer.File;
  };

  const detect = (mime: string | undefined) =>
    (fileTypeFromFile as jest.Mock).mockResolvedValue(
      mime ? { mime, ext: 'x' } : undefined,
    );

  const callsTo = (url: string) =>
    fetchMock.mock.calls.filter(([called]) => called === url);

  const sentBody = () =>
    JSON.parse(callsTo(MESSAGES_URL)[0][1].body as string) as Record<
      string,
      unknown
    >;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AWS_WHATSAPP_ACCESS_KEY_ID: 'wa-key',
      AWS_WHATSAPP_SECRET_ACCESS_KEY: 'wa-secret',
      AWS_S3_WHATSAPP_BUCKET: 'test-whatsapp-bucket',
    };
    dir = await mkdtemp(join(tmpdir(), 'wa-send-spec-'));
    mockUploads.length = 0;
    mockUploadFailure = null;
    mockS3Send.mockReset();
    (reserveStorage as jest.Mock).mockReset().mockResolvedValue(undefined);
    (releaseStorage as jest.Mock).mockReset().mockResolvedValue(undefined);
    (verifyTextFile as jest.Mock).mockReset().mockResolvedValue(undefined);
    detect('image/jpeg');

    chats = {
      findOne: jest.fn().mockResolvedValue({
        id: 'chat-row-1',
        lastInboundAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    };
    store = {
      addMessage: jest.fn().mockResolvedValue({ inserted: true }),
      findRowByUuid: jest.fn(),
      claimFailedLocalRow: jest.fn().mockResolvedValue(true),
      promoteLocalRow: jest.fn().mockResolvedValue(true),
      markLocalRowFailed: jest.fn().mockResolvedValue(undefined),
      getMessageByUuid: jest.fn(),
    };
    ai = { recordHumanReply: jest.fn().mockResolvedValue(undefined) };
    gateway = { emitMessage: jest.fn(), emitMessageUpdate: jest.fn() };
    sendResponse = () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT1' }] }), {
        status: 200,
      });
    fetchMock = jest.fn((url: string) =>
      Promise.resolve(
        url === MEDIA_URL
          ? new Response(JSON.stringify({ id: 'meta-media-1' }), {
              status: 200,
            })
          : sendResponse(),
      ),
    );
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);

    const connections = {
      findOne: jest.fn().mockResolvedValue(connection),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const cloud = new WhatsappCloudApiService(
      connections as any,
      {} as any,
      { emitConnection: jest.fn() } as any,
      {} as any,
      { decrypt: () => 'token-1' } as any,
    );
    jest
      .spyOn((cloud as any).logger, 'error')
      .mockImplementation(() => undefined);
    const wa = new WhatsappService(
      connections as any,
      chats as any,
      store as any,
      ai as any,
      gateway as any,
      cloud,
    );
    service = new WhatsappMediaSendService(
      {} as any,
      wa,
      store as any,
      cloud,
      ai as any,
      gateway as any,
    );
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('sendFile', () => {
    it('stores the image, uploads it to Meta, sends it with the caption and records the row', async () => {
      const file = await upload('photo.jpg', 2 * MB);

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        file,
        {
          caption: 'Front door',
        },
      );

      expect(reserveStorage).toHaveBeenCalledWith({}, 'company-1', 2 * MB);
      expect(mockUploads).toHaveLength(1);
      const key = `whatsapp/company-1/user-1/971501234567/${msg.uuid}.jpg`;
      expect(mockUploads[0].params).toMatchObject({
        Bucket: 'test-whatsapp-bucket',
        Key: key,
        ContentType: 'image/jpeg',
        CacheControl: 'private, max-age=600',
      });
      expect(mockUploads[0].partSize).toBe(8 * MB);
      expect(mockUploads[0].queueSize).toBe(2);
      expect(mockUploads[0].received?.toString()).toBe('file bytes');

      const form = callsTo(MEDIA_URL)[0][1].body as FormData;
      expect(form.get('messaging_product')).toBe('whatsapp');
      expect(form.get('type')).toBe('image/jpeg');
      expect((form.get('file') as File).name).toBe(`image-${msg.uuid}.jpg`);
      expect(sentBody()).toMatchObject({
        to: '971501234567',
        type: 'image',
        image: { id: 'meta-media-1', caption: 'Front door' },
      });

      expect(msg).toMatchObject({
        id: 'wamid.OUT1',
        body: 'Front door',
        fromMe: true,
        hasMedia: true,
        mediaType: 'image',
        mediaMime: 'image/jpeg',
        mediaFileName: `image-${msg.uuid}.jpg`,
        mediaSizeBytes: 2 * MB,
        mediaStatus: WaMediaStatus.STORED,
        senderId: '+1111111111',
        originUserId: 'user-1',
      });
      expect(msg.status).toBeUndefined();
      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({
          uuid: msg.uuid,
          mediaKey: key,
          mediaStoredAt: msg.mediaStoredAt,
        }),
        'pnid-1',
        {},
      );
      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
      );
      expect(gateway.emitMessage).toHaveBeenCalledWith('user-1', msg);
      expect(existsSync(file.path)).toBe(false);
    });

    it('keeps a document original file name, decoded as UTF-8, and sends it as filename', async () => {
      detect('application/pdf');
      const name = Buffer.from('عقد الإيجار.pdf', 'utf8').toString('latin1');
      const file = await upload(name, 3 * MB);

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        file,
      );

      expect(msg.mediaFileName).toBe('عقد الإيجار.pdf');
      expect(msg.body).toBe('');
      expect(sentBody()).toMatchObject({
        type: 'document',
        document: { id: 'meta-media-1', filename: 'عقد الإيجار.pdf' },
      });
      expect(mockUploads[0].params.Key).toMatch(/\.pdf$/);
    });

    it('checks an undetected file as text and sends it as a text document', async () => {
      detect(undefined);
      const file = await upload('notes.csv', 1000);

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        file,
      );

      expect(verifyTextFile).toHaveBeenCalledWith(file.path);
      expect(msg).toMatchObject({
        mediaType: 'document',
        mediaMime: 'text/csv',
      });
      // Meta lists plain text only, so a csv travels as text/plain under its own name.
      const uploadCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith('/media'),
      );
      const form = uploadCall?.[1]?.body as FormData;
      expect(form.get('type')).toBe('text/plain');
      expect((form.get('file') as File).name).toBe(file.originalname);
    });

    it('sends an Opus OGG as plain audio when it is not flagged as a voice note', async () => {
      detect('audio/ogg; codecs=opus');

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        await upload('song.ogg', 40_000),
      );

      expect(sentBody()).toMatchObject({
        type: 'audio',
        audio: { id: 'meta-media-1' },
      });
      expect(
        (sentBody().audio as Record<string, unknown>).voice,
      ).toBeUndefined();
      expect(msg).toMatchObject({ mediaType: 'audio', mediaMime: 'audio/ogg' });
    });

    it('refuses a Vorbis OGG, with or without the voice flag, before any upload', async () => {
      detect('audio/ogg');
      for (const options of [{}, { voice: true }]) {
        await expect(
          service.sendFile(
            'company-1',
            'user-1',
            '971501234567',
            await upload('vorbis.ogg', 40_000),
            options,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Only OGG files encoded with Opus can be sent on WhatsApp.',
          ),
        );
      }
      expect(reserveStorage).not.toHaveBeenCalled();
      expect(mockUploads).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends an OGG recording as a voice note', async () => {
      detect('audio/ogg; codecs=opus');
      const file = await upload('note.ogg', 40_000);

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        file,
        {
          voice: true,
        },
      );

      expect(sentBody()).toMatchObject({
        type: 'audio',
        audio: { id: 'meta-media-1', voice: true },
      });
      expect(msg).toMatchObject({ mediaType: 'audio', mediaMime: 'audio/ogg' });
    });

    it('refuses a voice note that is not OGG, and a caption on audio', async () => {
      detect('audio/mpeg');
      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('a.mp3', 1000),
          {
            voice: true,
          },
        ),
      ).rejects.toThrow('A voice note must be an OGG/Opus recording.');
      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('a.mp3', 1000),
          {
            caption: 'hi',
          },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('holds a static WebP sticker to 100 KB and an animated one to 500 KB, outside the quota', async () => {
      detect('image/webp');
      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('s.webp', 150 * 1024, webp(['VP8 '])),
        ),
      ).rejects.toThrow('Sticker is over 100 KB.');
      expect(mockUploads).toHaveLength(0);

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        await upload('a.webp', 150 * 1024, webp(['VP8X', 'ANIM', 'ANMF'])),
      );
      expect(msg.mediaType).toBe('sticker');
      expect(sentBody()).toMatchObject({
        type: 'sticker',
        sticker: { id: 'meta-media-1' },
      });
      expect(reserveStorage).not.toHaveBeenCalled();

      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('b.webp', 600 * 1024, webp(['VP8X', 'ANIM'])),
        ),
      ).rejects.toThrow('Animated sticker is over 500 KB.');
    });

    it('refuses a video over 16 MB with the exact message before any upload', async () => {
      detect('video/mp4');
      const file = await upload('clip.mp4', 17 * MB);

      await expect(
        service.sendFile('company-1', 'user-1', '971501234567', file),
      ).rejects.toThrow(new BadRequestException('Video is over 16 MB.'));

      expect(reserveStorage).not.toHaveBeenCalled();
      expect(mockUploads).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(existsSync(file.path)).toBe(false);
    });

    it('refuses bytes that match no allowed type, whatever the client claimed', async () => {
      detect('application/x-msdownload');
      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('photo.jpg', 1000),
        ),
      ).rejects.toThrow(
        'This file type (application/x-msdownload) cannot be sent on WhatsApp.',
      );

      detect(undefined);
      (verifyTextFile as jest.Mock).mockRejectedValue(
        new BadRequestException('File contains binary content'),
      );
      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('photo.jpg', 1000),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(reserveStorage).not.toHaveBeenCalled();
      expect(mockUploads).toHaveLength(0);
    });

    it('refuses a closed reply window with 409 before reserving quota', async () => {
      chats.findOne.mockResolvedValue({
        id: 'chat-row-1',
        lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('p.jpg', 1000),
        ),
      ).rejects.toThrow(ConflictException);

      expect(reserveStorage).not.toHaveBeenCalled();
      expect(mockUploads).toHaveLength(0);
      expect(ai.recordHumanReply).not.toHaveBeenCalled();
    });

    it('refuses with 507 before any bucket write when the quota is full', async () => {
      (reserveStorage as jest.Mock).mockRejectedValue(
        new HttpException(
          'Storage quota exceeded',
          HttpStatus.INSUFFICIENT_STORAGE,
        ),
      );

      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('p.jpg', 1000),
        ),
      ).rejects.toMatchObject({ status: HttpStatus.INSUFFICIENT_STORAGE });

      expect(mockUploads).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
    });

    it('releases the reservation and writes no row when the bucket upload fails', async () => {
      mockUploadFailure = new Error('bucket down');

      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('p.jpg', 4000),
        ),
      ).rejects.toThrow(InternalServerErrorException);

      expect(releaseStorage).toHaveBeenCalledWith({}, 'company-1', 4000);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('destroys the upload read stream when the bucket upload rejects', async () => {
      mockUploadFailure = new Error('bucket down');
      const destroy = jest.spyOn(ReadStream.prototype, 'destroy');

      await expect(
        service.sendFile(
          'company-1',
          'user-1',
          '971501234567',
          await upload('p.jpg', 4000),
        ),
      ).rejects.toThrow(InternalServerErrorException);

      const body = mockUploads[0].params.Body;
      expect(body).toBeInstanceOf(ReadStream);
      expect(destroy.mock.contexts).toContain(body);
      expect(body.destroyed).toBe(true);
    });

    it('records a failed row under a local id and keeps the stored copy when Meta refuses the send', async () => {
      sendResponse = () =>
        new Response(
          JSON.stringify({ error: { code: 131026, message: 'undeliverable' } }),
          {
            status: 400,
          },
        );

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        await upload('p.jpg', 4000),
      );

      expect(msg).toMatchObject({
        id: `local-${msg.uuid}`,
        status: WhatsappMessageStatus.FAILED,
        errorCode: '131026',
        mediaStatus: WaMediaStatus.STORED,
      });
      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({
          id: `local-${msg.uuid}`,
          mediaKey: expect.any(String),
        }),
        'pnid-1',
        expect.objectContaining({
          status: WhatsappMessageStatus.FAILED,
          errorCode: '131026',
        }),
      );
      expect(releaseStorage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).toHaveBeenCalledWith('user-1', msg);
    });

    it('records the HTTP status as the error code when the Meta upload fails without a Graph code', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url === MEDIA_URL
            ? new Response('bad gateway', { status: 502 })
            : sendResponse(),
        ),
      );

      const msg = await service.sendFile(
        'company-1',
        'user-1',
        '971501234567',
        await upload('p.jpg', 4000),
      );

      expect(msg).toMatchObject({
        status: WhatsappMessageStatus.FAILED,
        errorCode: '502',
      });
      expect(callsTo(MESSAGES_URL)).toHaveLength(0);
    });
  });

  describe('retry', () => {
    const failedRow = (overrides: Record<string, unknown> = {}) => ({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: 'company-1',
      userId: 'user-1',
      chatId: '971501234567',
      waMessageId: 'local-11111111-1111-4111-8111-111111111111',
      status: WhatsappMessageStatus.FAILED,
      body: 'Floor plan',
      mediaType: 'document',
      mediaMime: 'application/pdf',
      mediaFileName: 'plan.pdf',
      mediaKey:
        'whatsapp/company-1/user-1/971501234567/11111111-1111-4111-8111-111111111111.pdf',
      mediaStatus: WaMediaStatus.STORED,
      ...overrides,
    });
    const uuid = '11111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      store.findRowByUuid.mockResolvedValue(failedRow());
      store.getMessageByUuid.mockResolvedValue({ uuid, id: 'wamid.OUT1' });
      mockS3Send.mockResolvedValue({
        Body: Readable.from([Buffer.from('%PDF-1.7')]),
      });
    });

    it('resends the stored copy, promotes the row to the real wamid and pushes an update', async () => {
      const result = await service.retry(
        'company-1',
        { userId: 'user-1', role: Role.AGENT },
        uuid,
      );

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-whatsapp-bucket',
          Key: failedRow().mediaKey,
        }),
      );
      expect(store.claimFailedLocalRow).toHaveBeenCalledWith('company-1', uuid);
      expect(sentBody()).toMatchObject({
        type: 'document',
        document: {
          id: 'meta-media-1',
          caption: 'Floor plan',
          filename: 'plan.pdf',
        },
      });
      expect(store.promoteLocalRow).toHaveBeenCalledWith(
        'company-1',
        uuid,
        'wamid.OUT1',
      );
      expect(store.markLocalRowFailed).not.toHaveBeenCalled();
      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
      );
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith('user-1', {
        uuid,
        id: 'wamid.OUT1',
      });
      expect(result).toEqual({ uuid, id: 'wamid.OUT1' });
    });

    it('lets a company admin retry an agent row on that agent number', async () => {
      await service.retry(
        'company-1',
        { userId: 'admin-1', role: Role.COMPANY_ADMIN },
        uuid,
      );

      expect(store.promoteLocalRow).toHaveBeenCalled();
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );
    });

    it('keeps the row failed with the new error code when Meta refuses again', async () => {
      sendResponse = () =>
        new Response(JSON.stringify({ error: { code: 131000 } }), {
          status: 500,
        });
      store.getMessageByUuid.mockResolvedValue({
        uuid,
        status: 'failed',
        errorCode: '131000',
      });

      const result = await service.retry(
        'company-1',
        { userId: 'user-1', role: Role.AGENT },
        uuid,
      );

      expect(store.markLocalRowFailed).toHaveBeenCalledWith(
        'company-1',
        uuid,
        '131000',
      );
      expect(store.promoteLocalRow).not.toHaveBeenCalled();
      expect(gateway.emitMessageUpdate).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'failed' });
    });

    it('refuses a row that is not a failed local send with 409', async () => {
      store.findRowByUuid.mockResolvedValue(
        failedRow({
          waMessageId: 'wamid.real',
          status: WhatsappMessageStatus.DELIVERED,
        }),
      );

      await expect(
        service.retry(
          'company-1',
          { userId: 'user-1', role: Role.AGENT },
          uuid,
        ),
      ).rejects.toThrow(ConflictException);
      expect(store.claimFailedLocalRow).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a second retry already in flight with 409', async () => {
      store.claimFailedLocalRow.mockResolvedValue(false);

      await expect(
        service.retry(
          'company-1',
          { userId: 'user-1', role: Role.AGENT },
          uuid,
        ),
      ).rejects.toThrow('This message is already being retried');
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('refuses another agent row', async () => {
      await expect(
        service.retry(
          'company-1',
          { userId: 'user-2', role: Role.AGENT },
          uuid,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a closed reply window with 409 and leaves the row failed', async () => {
      chats.findOne.mockResolvedValue({
        id: 'chat-row-1',
        lastInboundAt: null,
      });

      await expect(
        service.retry(
          'company-1',
          { userId: 'user-1', role: Role.AGENT },
          uuid,
        ),
      ).rejects.toThrow(ConflictException);
      expect(store.claimFailedLocalRow).not.toHaveBeenCalled();
    });
  });
});
