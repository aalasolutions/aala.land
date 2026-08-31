import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Company } from '../../modules/companies/entities/company.entity';
import { RegionScope, seesAllRegions } from './region-visibility.util';

export { RegionScope };

export async function resolveRegionCode(
  companyRepository: Repository<Company>,
  companyId: string,
  regionCode?: string,
  caller?: RegionScope,
): Promise<string> {
  if (regionCode) {
    if (caller) {
      await assertRegionAllowed(
        companyRepository,
        companyId,
        regionCode,
        caller,
      );
    }
    return regionCode;
  }

  const company = await loadCompanyRegions(companyRepository, companyId);

  if (!company.defaultRegionCode) {
    throw new BadRequestException('Company has no default region configured');
  }

  return company.defaultRegionCode;
}

// A caller-supplied region is rejected when it sits outside what the
// caller may write to. Admins are checked against the company active
// regions, everyone else against their own assignments.
async function assertRegionAllowed(
  companyRepository: Repository<Company>,
  companyId: string,
  regionCode: string,
  caller: RegionScope,
): Promise<void> {
  if (seesAllRegions(caller.role)) {
    const company = await loadCompanyRegions(companyRepository, companyId);
    if (!(company.activeRegions ?? []).includes(regionCode)) {
      throw new BadRequestException(
        `Not active for this company: ${regionCode}`,
      );
    }
    return;
  }

  if (!(caller.regionCodes ?? []).includes(regionCode)) {
    throw new BadRequestException(`Not assigned to you: ${regionCode}`);
  }
}

async function loadCompanyRegions(
  companyRepository: Repository<Company>,
  companyId: string,
): Promise<Pick<Company, 'defaultRegionCode' | 'activeRegions'>> {
  const company = await companyRepository.findOne({
    where: { id: companyId },
    select: { defaultRegionCode: true, activeRegions: true },
  });

  if (!company) {
    throw new NotFoundException('Company not found');
  }

  return company;
}
