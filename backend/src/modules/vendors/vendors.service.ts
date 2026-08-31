import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere, In, Raw } from 'typeorm';
import { Vendor, VendorSpecialty } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { Company } from '../companies/entities/company.entity';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { paginationOptions } from '../../shared/utils/pagination.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async create(
    companyId: string,
    dto: CreateVendorDto,
    caller?: RegionScope,
  ): Promise<Vendor> {
    const regionCode = await resolveRegionCode(
      this.companyRepository,
      companyId,
      dto.regionCode,
      caller,
    );
    const vendor = this.vendorRepository.create({
      ...dto,
      companyId,
      regionCode,
    });
    return this.vendorRepository.save(vendor);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    search?: string,
    specialty?: VendorSpecialty,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<{ data: Vendor[]; total: number; page: number; limit: number }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const where: FindOptionsWhere<Vendor>[] = [];
    // isActive: true hides soft-deleted vendors (remove() sets isActive=false)
    const base: FindOptionsWhere<Vendor> = { companyId, isActive: true };
    if (regionCodes) base.regionCode = In(regionCodes);

    // specialties is a jsonb array, so filter by "contains this specialty" via @>
    const specialtyFilter: FindOptionsWhere<Vendor> = specialty
      ? ({
          specialties: Raw((alias) => `${alias} @> :spec::jsonb`, {
            spec: JSON.stringify([specialty]),
          }),
        } as unknown as FindOptionsWhere<Vendor>)
      : {};

    if (search && specialty) {
      const pattern = `%${search}%`;
      where.push(
        { ...base, ...specialtyFilter, name: ILike(pattern) },
        { ...base, ...specialtyFilter, email: ILike(pattern) },
        { ...base, ...specialtyFilter, phone: ILike(pattern) },
        { ...base, ...specialtyFilter, companyName: ILike(pattern) },
      );
    } else if (search) {
      const pattern = `%${search}%`;
      where.push(
        { ...base, name: ILike(pattern) },
        { ...base, email: ILike(pattern) },
        { ...base, phone: ILike(pattern) },
        { ...base, companyName: ILike(pattern) },
      );
    } else if (specialty) {
      where.push({ ...base, ...specialtyFilter });
    } else {
      where.push(base);
    }

    const [data, total] = await this.vendorRepository.findAndCount({
      where,
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Vendor> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Vendor not found');
    }

    const vendor = await this.vendorRepository.findOne({
      where: {
        id,
        companyId,
        ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
      },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateVendorDto,
    caller?: RegionScope,
  ): Promise<Vendor> {
    const vendor = await this.findOne(id, companyId, caller);
    Object.assign(vendor, dto);
    return this.vendorRepository.save(vendor);
  }

  async remove(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const vendor = await this.findOne(id, companyId, caller);
    vendor.isActive = false;
    await this.vendorRepository.save(vendor);
  }
}
