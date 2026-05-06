import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class ImpersonateService {
  constructor(private readonly usersService: UsersService) {}

  async impersonate(userId: string): Promise<{ email: string; sub: string; companyId: string; role: string }> {
    const user = await this.usersService.findByIdWithoutCompany(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return {
      email: user.email,
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
    };
  }
}
