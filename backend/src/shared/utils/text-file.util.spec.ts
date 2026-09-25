import { BadRequestException } from '@nestjs/common';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyTextFile } from './text-file.util';

describe('verifyTextFile', () => {
  let dir: string;
  const file = async (content: Buffer | string): Promise<string> => {
    const path = join(dir, `f-${Math.random().toString(36).slice(2)}`);
    await writeFile(path, content);
    return path;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'text-file-spec-'));
  });

  it('accepts UTF-8 text', async () => {
    await expect(
      verifyTextFile(await file('name,rent\nمكتب,5000\n')),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['a binary signature', '%PDF-1.7'],
    ['a NUL byte', Buffer.from([0x61, 0x00, 0x62])],
    ['invalid UTF-8', Buffer.from([0x61, 0xff, 0x62])],
  ])('refuses %s', async (_label, content) => {
    await expect(verifyTextFile(await file(content))).rejects.toThrow(
      BadRequestException,
    );
  });
});
