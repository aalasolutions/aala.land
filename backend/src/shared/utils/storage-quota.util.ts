import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
  FREE_STORAGE_BYTES,
  BYTES_PER_SEAT,
  ENTERPRISE_BYTES_PER_SEAT,
} from '@modules/companies/entities/company.entity';

/**
 * Returns the total storage quota in bytes for a given company.
 * Pure function, no I/O. Safe to call from any module that has the Company object.
 *
 * FREE tier:       2 GB flat, regardless of seat count.
 * PRO tier:        purchasedSeats * 5 GB.
 * ENTERPRISE tier: purchasedSeats * 10 GB.
 *
 * purchasedSeats defaults to 1 and is synced from the Stripe subscription
 * quantity by the webhook handler (unit 4).
 */
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

/**
 * Atomically checks and reserves storage for a company: the quota comparison and
 * the counter increment happen in a single conditional UPDATE, so two concurrent
 * uploads can never both read the same pre-upload usage, both pass, and jointly
 * push the company over quota. If the update matches zero rows, the reservation
 * was rejected and storageUsedBytes was left untouched.
 *
 * Callers that fail after reserving (e.g. the S3 PUT throws) must roll back with
 * their own decrement helper — this function only ever adds.
 */
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
    const usedGB  = (Number(company.storageUsedBytes) / (1024 * 1024 * 1024)).toFixed(2);
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
