import {
  WA_OUTBOUND_MEDIA,
  countsTowardQuota,
  isVoiceNoteMedia,
  outboundObjectKey,
  outboundTextMime,
  resolveOutboundMedia,
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
  describe('outbound media', () => {
    const KB = 1024;
    const MB = 1024 * 1024;

    it('maps detected mimes to Meta types with their limits', () => {
      expect(resolveOutboundMedia('image/jpeg', MB, 'a.jpg')).toMatchObject({
        type: 'image',
        mime: 'image/jpeg',
        ext: 'jpg',
        limitBytes: 5 * MB,
      });
      expect(
        resolveOutboundMedia('audio/ogg; codecs=opus', MB, 'n.ogg'),
      ).toMatchObject({
        type: 'audio',
        mime: 'audio/ogg',
      });
      expect(resolveOutboundMedia('audio/x-m4a', MB, 'v.m4a')).toMatchObject({
        type: 'audio',
        mime: 'audio/mp4',
      });
      expect(resolveOutboundMedia('image/gif', MB, 'a.gif')).toEqual({
        refusal: 'This file type (image/gif) cannot be sent on WhatsApp.',
      });
      expect(resolveOutboundMedia('application/rtf', KB, 'a.rtf')).toEqual({
        refusal: 'This file type (application/rtf) cannot be sent on WhatsApp.',
      });
      expect(WA_OUTBOUND_MEDIA['text/csv']).toMatchObject({ type: 'document' });
      expect(resolveOutboundMedia('text/csv', KB, 'a.csv')).toMatchObject({
        mime: 'text/csv',
        uploadMime: 'text/plain',
      });
      expect(
        resolveOutboundMedia('application/pdf', KB, 'a.pdf'),
      ).toMatchObject({
        uploadMime: 'application/pdf',
      });
    });

    it('accepts Opus OGG only and refuses Vorbis, FLAC or Speex OGG', () => {
      expect(
        resolveOutboundMedia('audio/ogg; codecs=opus', MB, 'n.ogg'),
      ).toMatchObject({
        type: 'audio',
        mime: 'audio/ogg',
        ext: 'ogg',
        limitBytes: 16 * MB,
      });
      expect(resolveOutboundMedia('audio/ogg', MB, 'v.ogg')).toEqual({
        refusal: 'Only OGG files encoded with Opus can be sent on WhatsApp.',
      });
      expect(isVoiceNoteMedia('audio', 'audio/ogg')).toBe(true);
      expect(isVoiceNoteMedia('audio', 'audio/mpeg')).toBe(false);
      expect(isVoiceNoteMedia('document', 'audio/ogg')).toBe(false);
    });

    it('names legacy Office files from their extension and refuses other compound files', () => {
      expect(
        resolveOutboundMedia('application/x-cfb', MB, 'old.XLS'),
      ).toMatchObject({
        type: 'document',
        mime: 'application/vnd.ms-excel',
        ext: 'xls',
      });
      expect(resolveOutboundMedia('application/x-cfb', MB, 'mail.msg')).toEqual(
        {
          refusal:
            'This file type (application/x-cfb) cannot be sent on WhatsApp.',
        },
      );
    });

    it('refuses over-limit files with a message per type', () => {
      expect(resolveOutboundMedia('video/3gpp', 16 * MB + 1, 'c.3gp')).toEqual({
        refusal: 'Video is over 16 MB.',
      });
      expect(resolveOutboundMedia('image/png', 5 * MB + 1, 'a.png')).toEqual({
        refusal: 'Image is over 5 MB.',
      });
      expect(
        resolveOutboundMedia('application/pdf', 100 * MB + 1, 'a.pdf'),
      ).toEqual({
        refusal: 'File is over 100 MB.',
      });
      expect(resolveOutboundMedia('image/webp', 101 * 1024, 's.webp')).toEqual({
        refusal: 'Sticker is over 100 KB.',
      });
      expect(
        resolveOutboundMedia('image/webp', 101 * 1024, 's.webp', true),
      ).toMatchObject({
        type: 'sticker',
        limitBytes: 500 * 1024,
      });
      expect(resolveOutboundMedia('image/png', 0, 'a.png')).toEqual({
        refusal: 'The file is empty.',
      });
    });

    it('builds the outbound key from the row uuid under a safe chat id', () => {
      expect(
        outboundObjectKey('co-1', 'user-1', '+97150/1', 'uuid-1', 'jpg'),
      ).toBe('whatsapp/co-1/user-1/_97150_1/uuid-1.jpg');
    });

    it('names a text document from its extension', () => {
      expect(outboundTextMime('a.CSV')).toBe('text/csv');
      expect(outboundTextMime('readme.md')).toBe('text/markdown');
      expect(outboundTextMime('notes')).toBe('text/plain');
    });
  });
});
