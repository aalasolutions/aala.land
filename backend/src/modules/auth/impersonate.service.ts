import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Role } from '@shared/enums/roles.enum';

@Injectable()
export class ImpersonateService {
  constructor(private readonly usersService: UsersService) {}

  async impersonate(
    userId: string,
  ): Promise<{
    email: string;
    sub: string;
    name: string;
    companyId: string | null;
    role: string;
  }> {
    const user = await this.usersService.findByIdWithCompany(userId);
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

    if (user.role !== Role.SUPER_ADMIN) {
      if (!user.companyId || !userStatus.company) {
        throw new BadRequestException('User company not found');
      }
      if (
        userStatus.company.isActive === false ||
        userStatus.company.active === false
      ) {
        throw new BadRequestException('User company is inactive');
      }
    }

    return {
      email: user.email,
      sub: user.id,
      name: user.name,
      companyId: user.companyId,
      role: user.role,
    };
  }
}
