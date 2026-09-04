import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

// Shaped like RedisModule: cross-cutting infrastructure with no domain of its own,
// provided once and imported by whichever feature module needs it.
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
