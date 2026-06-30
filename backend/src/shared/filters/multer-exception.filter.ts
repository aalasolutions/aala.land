import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({
        success: false,
        message: 'File exceeds the maximum allowed size.',
        error: 'Payload Too Large',
        statusCode: 413,
      });
      return;
    }

    response.status(400).json({
      success: false,
      message: exception.message,
      error: 'Bad Request',
      statusCode: 400,
    });
  }
}
