import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

// Shaped like RedisModule: cross-cutting infra, provided once for whichever module needs it.
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
