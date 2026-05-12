import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { BadRequestException } from '@nestjs/common';

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
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    getMyProfile(@Request() req: AuthenticatedRequest) {
        return this.usersService.findOne(req.user.userId, req.user.companyId ?? undefined);
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

    @Delete(':id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a user (ADMIN+)' })
    remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        const companyId = req.user.role === Role.SUPER_ADMIN ? undefined : (req.user.companyId ?? undefined);
        return this.usersService.remove(id, companyId, req.user.role);
    }
}
