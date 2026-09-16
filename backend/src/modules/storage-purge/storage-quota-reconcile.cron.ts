import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/** Recomputes storage_used_bytes using the same SUM as migration 1779300000009. */
@Injectable()
export class StorageQuotaReconcileCron {
  private readonly logger = new Logger(StorageQuotaReconcileCron.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 5 * * *', { timeZone: 'UTC' })
  async run(): Promise<void> {
    // WITH ... SELECT so the driver returns plain rows, not [rows, count].
    const rows: Array<{ id: string; old_bytes: string; new_bytes: string }> =
      await this.dataSource.query(`
        WITH actual AS (
          SELECT c.id,
            c.storage_used_bytes AS old_bytes,
            (
              SELECT COALESCE(SUM(
                COALESCE(pm.file_size, 0) + COALESCE(pm.thumbnail_size, 0)
              ), 0)
              FROM "property_media" pm
              WHERE pm.company_id = c.id
            ) + (
              SELECT COALESCE(SUM(COALESCE(pd.file_size, 0)), 0)
              FROM "property_documents" pd
              WHERE pd.company_id = c.id
            ) AS new_bytes
          FROM "companies" c
        ),
        updated AS (
          UPDATE "companies" c
          SET "storage_used_bytes" = a.new_bytes
          FROM actual a
          WHERE a.id = c.id AND a.old_bytes <> a.new_bytes
          RETURNING a.id, a.old_bytes, a.new_bytes
        )
        SELECT id, old_bytes, new_bytes FROM updated
      `);

    if (rows.length === 0) return;

    const totalDrift = rows.reduce(
      (sum, r) => sum + Math.abs(Number(r.new_bytes) - Number(r.old_bytes)),
      0,
    );
    this.logger.warn(
      `Corrected storage_used_bytes drift on ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'}, total drift ${totalDrift} bytes`,
    );
  }
}
