import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
    ) { }

    async create(dto: CreateCompanyDto): Promise<Company> {
        const company = this.companyRepository.create(dto);
        return this.companyRepository.save(company);
    }

    async findAll(page = 1, limit = 20): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
        const [data, total] = await this.companyRepository.findAndCount({
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOne(id: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { id } });
        if (!company) {
            throw new NotFoundException(`Company with ID ${id} not found`);
        }
        return company;
    }

    async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
        const company = await this.findOne(id);
        Object.assign(company, dto);
        return this.companyRepository.save(company);
    }

    async findBySlug(slug: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { slug } });
        if (!company) {
            throw new NotFoundException(`Company with slug ${slug} not found`);
        }
        return company;
    }
}
