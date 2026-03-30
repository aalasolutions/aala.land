import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Vendor, VendorSpecialty } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { Company } from '../companies/entities/company.entity';
import { resolveRegionCode } from '../../shared/utils/resolve-region-code.util';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async create(companyId: string, dto: CreateVendorDto): Promise<Vendor> {
    const regionCode = await resolveRegionCode(this.companyRepository, companyId, dto.regionCode);
    const vendor = this.vendorRepository.create({ ...dto, companyId, regionCode });
    return this.vendorRepository.save(vendor);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    search?: string,
    specialty?: VendorSpecialty,
    regionCode?: string,
  ): Promise<{ data: Vendor[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<Vendor>[] = [];
    const base: FindOptionsWhere<Vendor> = { companyId };
    if (regionCode) base.regionCode = regionCode;

    if (search && specialty) {
      const pattern = `%${search}%`;
      where.push(
        { ...base, specialty, name: ILike(pattern) },
        { ...base, specialty, email: ILike(pattern) },
        { ...base, specialty, phone: ILike(pattern) },
        { ...base, specialty, companyName: ILike(pattern) },
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
      where.push({ ...base, specialty });
    } else {
      where.push(base);
    }

    const [data, total] = await this.vendorRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Vendor> {
    const vendor = await this.vendorRepository.findOne({
      where: { id, companyId },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  async update(id: string, companyId: string, dto: UpdateVendorDto): Promise<Vendor> {
    const vendor = await this.findOne(id, companyId);
    Object.assign(vendor, dto);
    return this.vendorRepository.save(vendor);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const vendor = await this.findOne(id, companyId);
    vendor.isActive = false;
    await this.vendorRepository.save(vendor);
  }
}
