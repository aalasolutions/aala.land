import {
  countsTowardQuota,
  resolveInboundMedia,
  resolveMediaUrlTtlSeconds,
  revokeMediaDeletedBy,
  toWireMessage,
} from './wa-media.util';
import { WaMediaStatus, WaMessage, WaMessageInsert } from './wa-types';

describe('wa-media.util', () => {
  describe('resolveMediaUrlTtlSeconds', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('defaults to 600 seconds', () => {
      delete process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS;
      expect(resolveMediaUrlTtlSeconds()).toBe(600);
    });

    it('reads the environment and falls back below the 60 second floor', () => {
      process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS = '120';
      expect(resolveMediaUrlTtlSeconds()).toBe(120);
      process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS = '30';
      expect(resolveMediaUrlTtlSeconds()).toBe(600);
    });
  });

  it('exempts only stickers from the quota', () => {
    expect(countsTowardQuota('sticker')).toBe(false);
    expect(countsTowardQuota('image')).toBe(true);
    expect(countsTowardQuota('document')).toBe(true);
  });

  it('names the revoke side', () => {
    expect(revokeMediaDeletedBy(false)).toBe('CUSTOMER_REVOKE');
    expect(revokeMediaDeletedBy(true)).toBe('BUSINESS_APP_REVOKE');
  });

  describe('resolveInboundMedia', () => {
    it('maps a media message to PENDING columns with its caption as body', () => {
      expect(
        resolveInboundMedia({
          id: 'wamid.1',
          type: 'image',
          image: {
            id: 'meta-1',
            mime_type: 'image/jpeg',
            sha256: 'abc=',
            caption: 'the flat',
          },
        }),
      ).toEqual({
        body: 'the flat',
        mediaType: 'image',
        mediaStatus: WaMediaStatus.PENDING,
        mediaMetaId: 'meta-1',
        mediaMime: 'image/jpeg',
        mediaSha256: 'abc=',
        mediaFileName: 'image-wamid_1.jpg',
      });
    });

    it('keeps a document file name', () => {
      expect(
        resolveInboundMedia({
          id: 'wamid.2',
          type: 'document',
          document: { id: 'meta-2', filename: ' Lease.pdf ' },
        })?.mediaFileName,
      ).toBe('Lease.pdf');
    });

    it('marks a file over Meta limit as TOO_LARGE', () => {
      expect(
        resolveInboundMedia({
          id: 'wamid.3',
          type: 'unsupported',
          errors: [{ code: 131052 }],
        }),
      ).toEqual(
        expect.objectContaining({
          body: '',
          mediaType: 'media_placeholder',
          mediaStatus: WaMediaStatus.TOO_LARGE,
          mediaMetaId: null,
        }),
      );
    });

    it('returns null for text, a missing media id or a missing message id', () => {
      expect(resolveInboundMedia({ id: 'wamid.4', type: 'text' })).toBeNull();
      expect(
        resolveInboundMedia({ id: 'wamid.5', type: 'image', image: {} }),
      ).toBeNull();
      expect(
        resolveInboundMedia({ type: 'image', image: { id: 'meta-6' } }),
      ).toBeNull();
    });
  });

  it('strips the Meta media id and hash from the socket payload', () => {
    const evt = {
      uuid: 'row-1',
      id: 'wamid.1',
      body: '',
      mediaMetaId: 'meta-1',
      mediaSha256: 'abc=',
      mediaStatus: WaMediaStatus.PENDING,
    } as unknown as WaMessage & WaMessageInsert;

    const wire = toWireMessage(evt);

    expect(wire).not.toHaveProperty('mediaMetaId');
    expect(wire).not.toHaveProperty('mediaSha256');
    expect(wire).toEqual(
      expect.objectContaining({ uuid: 'row-1', mediaStatus: 'PENDING' }),
    );
    expect(evt.mediaMetaId).toBe('meta-1');
  });
});
