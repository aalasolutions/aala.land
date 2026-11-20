import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, type Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { unlink } from 'node:fs/promises';
import { diskStorage, type Options as MulterOptions } from 'multer';
import { storageSafeName } from '@shared/utils/file-name.util';
import { verifyTextFile } from '@shared/utils/text-file.util';
import { IMPORT_MAX_BYTES } from './import-validation';

export const IMPORT_FILE_TYPE_MESSAGE = 'Upload a CSV or Excel (.xlsx) file.';
export const IMPORT_NO_FILE_MESSAGE = 'Choose a file to upload.';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_MIMES = new Set([
  XLSX_MIME,
  'application/zip',
  'application/x-zip-compressed',
]);

const ALLOWED_EXTENSIONS = /\.(csv|xlsx)$/i;

// Spooled to disk like document uploads; the extension is the first gate, the content sniff the second.
export const importUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_req, file, cb) => {
      cb(null, `import-${randomUUID()}-${storageSafeName(file.originalname)}`);
    },
  }),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.test(file.originalname ?? '')) {
      return cb(new BadRequestException(IMPORT_FILE_TYPE_MESSAGE));
    }
    cb(null, true);
  },
};

// Returns the MIME the reader should assume once the bytes have been checked against the extension.
export async function sniffImportFile(
  file: Express.Multer.File,
): Promise<string> {
  const { fileTypeFromFile } = await import('file-type');
  const detected = await fileTypeFromFile(file.path);
  if (detected) {
    if (!ZIP_MIMES.has(detected.mime)) {
      throw new BadRequestException(IMPORT_FILE_TYPE_MESSAGE);
    }
    return XLSX_MIME;
  }
  await verifyTextFile(file.path);
  return 'text/csv';
}

const logger = new Logger('ImportUpload');

export async function discardUpload(
  file: Express.Multer.File | undefined,
): Promise<void> {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Could not discard import upload ${file.path}: ${message}`);
  }
}

// Runs after FileInterceptor, so the spooled file goes whether the pipe, the tier check or the parse ends the request.
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(finalize(() => void discardUpload(request.file)));
  }
}
