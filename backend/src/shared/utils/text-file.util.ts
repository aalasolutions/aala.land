import { BadRequestException } from '@nestjs/common';
import { createReadStream } from 'fs';

// <html> deliberately excluded from the binary-signature list.
const TEXT_FILE_BINARY_SIGNATURES: ReadonlyArray<{
  bytes: Buffer;
  caseInsensitive?: boolean;
}> = [
  { bytes: Buffer.from('<script'), caseInsensitive: true },
  { bytes: Buffer.from('<?php'), caseInsensitive: true },
  { bytes: Buffer.from('MZ') },
  { bytes: Buffer.from('%PDF') },
  { bytes: Buffer.from('PK') },
];
const TEXT_FILE_SIGNATURE_SAMPLE_SIZE = Math.max(
  ...TEXT_FILE_BINARY_SIGNATURES.map((s) => s.bytes.length),
);

// Content sanity check for formats with no magic-byte signature.
export async function verifyTextFile(filePath: string): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let checkedHead = false;

  const stream = createReadStream(filePath);
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (!checkedHead) {
        checkedHead = true;
        const head = chunk.subarray(0, TEXT_FILE_SIGNATURE_SAMPLE_SIZE);
        for (const sig of TEXT_FILE_BINARY_SIGNATURES) {
          const candidate = head.subarray(0, sig.bytes.length);
          const matches = sig.caseInsensitive
            ? candidate.toString('latin1').toLowerCase() ===
              sig.bytes.toString('latin1').toLowerCase()
            : candidate.equals(sig.bytes);
          if (matches) {
            throw new BadRequestException(
              'File content does not look like plain text; upload rejected.',
            );
          }
        }
      }

      if (chunk.includes(0)) {
        throw new BadRequestException(
          'File contains binary content and cannot be accepted as a text document.',
        );
      }

      try {
        decoder.decode(chunk, { stream: true });
      } catch {
        throw new BadRequestException('File is not valid UTF-8 text.');
      }
    }

    try {
      decoder.decode();
    } catch {
      throw new BadRequestException('File is not valid UTF-8 text.');
    }
  } finally {
    stream.destroy();
  }
}
