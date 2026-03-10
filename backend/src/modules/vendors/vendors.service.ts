import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Vendor, VendorSpecialty } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
  ) {}

  async create(companyId: string, dto: CreateVendorDto): Promise<Vendor> {
    const vendor = this.vendorRepository.create({ ...dto, companyId });
    return this.vendorRepository.save(vendor);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    search?: string,
    specialty?: VendorSpecialty,
  ): Promise<{ data: Vendor[]; total: number; page: number; limit: number }> {
    const where: any[] = [];

    if (search && specialty) {
      const pattern = `%${search}%`;
      where.push(
        { companyId, specialty, name: ILike(pattern) },
        { companyId, specialty, email: ILike(pattern) },
        { companyId, specialty, phone: ILike(pattern) },
        { companyId, specialty, companyName: ILike(pattern) },
      );
    } else if (search) {
      const pattern = `%${search}%`;
      where.push(
        { companyId, name: ILike(pattern) },
        { companyId, email: ILike(pattern) },
        { companyId, phone: ILike(pattern) },
        { companyId, companyName: ILike(pattern) },
      );
    } else if (specialty) {
      where.push({ companyId, specialty });
    } else {
      where.push({ companyId });
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
