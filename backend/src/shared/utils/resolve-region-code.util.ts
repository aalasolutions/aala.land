import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Company } from '../../modules/companies/entities/company.entity';

export async function resolveRegionCode(
  companyRepository: Repository<Company>,
  companyId: string,
  regionCode?: string,
): Promise<string> {
  if (regionCode) return regionCode;

  const company = await companyRepository.findOne({
    where: { id: companyId },
    select: { defaultRegionCode: true },
  });

  if (!company) {
    throw new NotFoundException('Company not found');
  }

  if (!company.defaultRegionCode) {
    throw new BadRequestException('Company has no default region configured');
  }

  return company.defaultRegionCode;
}
