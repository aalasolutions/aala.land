import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ListingType } from '../entities/listing.entity';

export class CreateListingDto {
    @IsUUID()
    unitId: string;

    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    price: number;

    @IsOptional()
    @IsEnum(ListingType)
    type?: ListingType;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    photos?: string[];

    @IsOptional()
    @IsString()
    contactPhone?: string;

    @IsOptional()
    @IsString()
    contactEmail?: string;

    @IsOptional()
    @IsBoolean()
    featured?: boolean;
}
