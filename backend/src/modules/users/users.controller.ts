import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Patch,
    UseGuards,
    Request,
    Query,
    ParseIntPipe,
    ParseUUIDPipe,
    DefaultValuePipe,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { RemoveUserDto } from './dto/remove-user.dto';
import { TrimCompanyUsersDto } from './dto/trim-company-users.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Create a new user (ADMIN+)' })
    create(@Body() createUserDto: CreateUserDto, @Request() req: AuthenticatedRequest) {
        if (req.user.role === Role.SUPER_ADMIN) {
            if (!createUserDto.companyId) {
                throw new BadRequestException('companyId is required for SUPER_ADMIN');
            }
            return this.usersService.create(createUserDto, createUserDto.companyId, req.user.role as Role);
        }
        if (!req.user.companyId) {
            throw new BadRequestException('companyId is required');
        }
        return this.usersService.create(createUserDto, req.user.companyId, req.user.role as Role);
    }

    @Post('invite')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Invite a new user via temporary password (ADMIN+)' })
    invite(@Body() dto: InviteUserDto, @Request() req: AuthenticatedRequest) {
        if (req.user.role === Role.SUPER_ADMIN) {
            if (!dto.companyId) {
                throw new BadRequestException('companyId is required for SUPER_ADMIN');
            }
            return this.usersService.inviteUser(dto.companyId, dto, req.user.role as Role);
        }
        if (!req.user.companyId) {
            throw new BadRequestException('companyId is required');
        }
        return this.usersService.inviteUser(req.user.companyId, dto, req.user.role as Role);
    }

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    getMyProfile(@Request() req: AuthenticatedRequest) {
        return this.usersService.findOne(req.user.userId, req.user.companyId ?? undefined);
    }

    @Patch('me')
    @ApiOperation({ summary: 'Update current user profile' })
    updateMyProfile(@Body() updateUserDto: UpdateUserDto, @Request() req: AuthenticatedRequest) {
        const { name, password } = updateUserDto;
        const safeUpdates: Pick<UpdateUserDto, 'name' | 'password'> = {};
        if (name !== undefined) safeUpdates.name = name;
        if (password !== undefined) safeUpdates.password = password;

        return this.usersService.update(
            req.user.userId,
            req.user.companyId ?? undefined,
            safeUpdates,
            req.user.role,
            req.user.userId,
        );
    }

    @Get()
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({
        summary: 'List users (paginated)',
        description: 'SUPER_ADMIN receives users across all companies. COMPANY_ADMIN and ADMIN are scoped to their own company.',
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.findAll(companyId, page, limit);
    }

    @Get('agents')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List all agents for current company (for lead assignment)' })
    findAgents(@Request() req: AuthenticatedRequest) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.findAgents(companyId);
    }

    @Get(':id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Get a user by ID (scoped to company)' })
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.findOne(id, companyId);
    }

    @Patch(':id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Update a user (ADMIN+)' })
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: AuthenticatedRequest) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.update(id, companyId, updateUserDto, req.user.role, req.user.userId);
    }

    @Post(':id/delete')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({
        summary: 'Permanently delete a user after reassigning owned records to a named user (ADMIN+)',
        description:
            'POST (not DELETE) because the reassignToUserId + reason payload must be carried in the body, and DELETE bodies are stripped by some proxies and HTTP clients. ' +
            'Blocked with 409 when the user has approved, paid, or cancelled commissions; deactivate instead. Returns the ReassignmentReport.',
    })
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RemoveUserDto,
        @Request() req: AuthenticatedRequest,
    ) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.deleteUserWithReassignment(id, req.user.userId, companyId, req.user.role as Role, dto);
    }

    @Post(':id/deactivate')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({
        summary: 'Deactivate a user, reassign owned records to a named user, decrement the seat on paid plans (ADMIN+)',
        description: 'Returns the ReassignmentReport. Reversible via POST /users/:id/reactivate.',
    })
    deactivate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RemoveUserDto,
        @Request() req: AuthenticatedRequest,
    ) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.deactivateUser(id, req.user.userId, companyId, req.user.role as Role, dto);
    }

    @Post(':id/reactivate')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Reactivate a deactivated user, incrementing the seat on paid plans (ADMIN+)' })
    reactivate(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.reactivateUser(id, companyId, req.user.role as Role);
    }

    @Post('trim-to-one')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({
        summary: 'Deactivate every active user except one company admin and reassign their records (COMPANY_ADMIN only)',
        description: 'Downgrade preparation: satisfies the downgrade-to-Free gate, which requires exactly one active user.',
    })
    trimToOne(@Body() dto: TrimCompanyUsersDto, @Request() req: AuthenticatedRequest) {
        if (!req.user.companyId) {
            throw new BadRequestException('companyId is required');
        }
        return this.usersService.trimToOneActiveUser(req.user.companyId, req.user.userId, dto);
    }
}
