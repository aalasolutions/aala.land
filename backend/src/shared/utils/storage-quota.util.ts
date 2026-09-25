import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
  FREE_STORAGE_BYTES,
  BYTES_PER_SEAT,
  ENTERPRISE_BYTES_PER_SEAT,
} from '@modules/companies/entities/company.entity';

// Pure function, safe to call from anywhere with a Company object
export function getStorageQuotaBytes(company: Company): number {
  const tier = company.subscriptionTier as SubscriptionTier;
  if (tier === SubscriptionTier.FREE) {
    return FREE_STORAGE_BYTES;
  }
  if (tier === SubscriptionTier.ENTERPRISE) {
    return Math.max(company.purchasedSeats, 1) * ENTERPRISE_BYTES_PER_SEAT;
  }
  // PRO (and any future unknown tier): 5 GB/seat
  return Math.max(company.purchasedSeats, 1) * BYTES_PER_SEAT;
}

// One conditional UPDATE: concurrent uploads can't both pass and push the company over quota
export async function reserveStorage(
  companyRepository: Repository<Company>,
  companyId: string,
  incomingBytes: number,
): Promise<void> {
  if (!Number.isFinite(incomingBytes) || incomingBytes <= 0) {
    throw new HttpException(
      {
        message: 'incomingBytes must be a positive number',
        error: 'Bad Request',
        statusCode: HttpStatus.BAD_REQUEST,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const company = await companyRepository.findOne({ where: { id: companyId } });
  if (!company) throw new NotFoundException('Company not found');

  const quotaBytes = getStorageQuotaBytes(company);

  const result = await companyRepository
    .createQueryBuilder()
    .update(Company)
    .set({ storageUsedBytes: () => '"storage_used_bytes" + :incomingBytes' })
    .where('id = :companyId', { companyId })
    .andWhere('"storage_used_bytes" + :incomingBytes <= :quotaBytes')
    .setParameters({ incomingBytes, quotaBytes })
    .execute();

  if (!result.affected) {
    const usedGB = (
      Number(company.storageUsedBytes) /
      (1024 * 1024 * 1024)
    ).toFixed(2);
    const quotaGB = (quotaBytes / (1024 * 1024 * 1024)).toFixed(2);
    throw new HttpException(
      {
        message:
          `Storage quota exceeded. Used ${usedGB} GB of ${quotaGB} GB. ` +
          `Upgrade your plan or add a seat to increase storage.`,
        error: 'Insufficient Storage',
        statusCode: HttpStatus.INSUFFICIENT_STORAGE,
      },
      HttpStatus.INSUFFICIENT_STORAGE,
    );
  }
}

// Unconditional: customer WhatsApp media is always stored, so usage may exceed quota.
export async function addStorageUsage(
  companyRepository: Repository<Company>,
  companyId: string,
  bytes: number,
): Promise<void> {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`addStorageUsage: invalid byte count ${bytes}`);
  }
  if (bytes === 0) return;
  await companyRepository
    .createQueryBuilder()
    .update(Company)
    .set({ storageUsedBytes: () => '"storage_used_bytes" + :bytes' })
    .where('id = :companyId', { companyId })
    .setParameters({ bytes })
    .execute();
}

// Floors at zero so a release can never drive usage negative.
export async function releaseStorage(
  companyRepository: Repository<Company>,
  companyId: string,
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return;
  await companyRepository
    .createQueryBuilder()
    .update(Company)
    .set({
      storageUsedBytes: () => 'GREATEST("storage_used_bytes" - :bytes, 0)',
    })
    .setParameter('bytes', bytes)
    .where('id = :companyId', { companyId })
    .execute();
}
