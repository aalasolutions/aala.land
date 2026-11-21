import type { Response } from 'express';
import { sendExportFile } from './export-response.util';

describe('sendExportFile', () => {
  function response() {
    const headers: Record<string, string> = {};
    return {
      headers,
      res: {
        setHeader: jest.fn((name: string, value: string) => {
          headers[name] = value;
        }),
        send: jest.fn(),
      } as unknown as Response,
    };
  }

  it('sets the attachment headers and sends the buffer', () => {
    const { res, headers } = response();
    const buffer = Buffer.from('a,b');
    sendExportFile(res, {
      buffer,
      contentType: 'text/csv; charset=utf-8',
      fileName: 'units-all-2026-11-21.csv',
      truncated: false,
    });
    expect(headers).toEqual({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="units-all-2026-11-21.csv"',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  it('adds the truncation header and keeps quotes out of the file name', () => {
    const { res, headers } = response();
    sendExportFile(res, {
      buffer: Buffer.alloc(0),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'a"b\r\n.csv',
      truncated: true,
    });
    expect(headers['X-Export-Truncated']).toBe('true');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="a_b__.csv"',
    );
  });
});
