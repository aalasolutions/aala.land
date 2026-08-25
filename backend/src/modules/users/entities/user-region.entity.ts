import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

// One row per region a user may work in. A user with two rows can switch
// between them; a user with one is pinned to it.
@Entity('user_regions')
@Unique('UQ_user_regions_user_region', ['userId', 'regionCode'])
export class UserRegion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_USER_REGIONS_USER_ID')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.regions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('IDX_USER_REGIONS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
