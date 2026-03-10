import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChequesService } from './cheques.service';
import { ChequesController } from './cheques.controller';
import { Cheque } from './entities/cheque.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cheque])],
  controllers: [ChequesController],
  providers: [ChequesService],
  exports: [ChequesService],
})
export class ChequesModule { }
