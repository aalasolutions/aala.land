import type { Response } from 'express';
import { headerSafeName } from './file-name.util';

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  truncated: boolean;
}

// Streams an export as an attachment; the caller's @Res() keeps the ResponseInterceptor out of the way.
export function sendExportFile(res: Response, file: ExportFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${headerSafeName(file.fileName)}"`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (file.truncated) res.setHeader('X-Export-Truncated', 'true');
  res.send(file.buffer);
}
