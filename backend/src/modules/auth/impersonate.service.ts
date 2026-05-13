import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class ImpersonateService {
  constructor(private readonly usersService: UsersService) {}

  async impersonate(userId: string): Promise<{ email: string; sub: string; name: string; companyId: string | null; role: string }> {
    const user = await this.usersService.findByIdWithoutCompany(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.isActive === false) {
      throw new BadRequestException('User is inactive');
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
