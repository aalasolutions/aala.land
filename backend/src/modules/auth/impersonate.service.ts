import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class ImpersonateService {
  constructor(private readonly usersService: UsersService) {}

  async impersonate(userId: string): Promise<{ email: string; sub: string; companyId: string | null; role: string }> {
    const user = await this.usersService.findByIdWithoutCompany(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const userStatus = user as {
      isActive?: boolean;
      active?: boolean;
      company?: { isActive?: boolean; active?: boolean } | null;
    };
    if (userStatus.isActive === false || userStatus.active === false) {
      throw new BadRequestException('User is inactive');
    }

    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId || !userStatus.company) {
        throw new BadRequestException('User company not found');
      }
      if (userStatus.company.isActive === false || userStatus.company.active === false) {
        throw new BadRequestException('User company is inactive');
      }
    }

    return {
      email: user.email,
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
    };
  }
}
