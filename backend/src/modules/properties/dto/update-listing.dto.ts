import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { CreateListingDto } from './create-listing.dto';
import { ListingStatus } from '../entities/listing.entity';

export class UpdateListingDto extends PartialType(CreateListingDto) {
    @IsOptional()
    @IsEnum(ListingStatus)
    status?: ListingStatus;
}
