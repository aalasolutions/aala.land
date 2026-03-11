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

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new user (COMPANY_ADMIN+)' })
    create(@Body() createUserDto: CreateUserDto, @Request() req) {
        return this.usersService.create(createUserDto, req.user.companyId);
    }

    @Post('invite')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Invite a new user via temporary password (COMPANY_ADMIN+)' })
    invite(@Body() dto: InviteUserDto, @Request() req) {
        return this.usersService.inviteUser(req.user.companyId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List users for current company (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Request() req,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.usersService.findAll(req.user.companyId, page, limit);
    }

    @Get('agents')
    @ApiOperation({ summary: 'List all agents for current company (for lead assignment)' })
    findAgents(@Request() req) {
        return this.usersService.findAgents(req.user.companyId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user by ID (scoped to company)' })
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
        return this.usersService.findOne(id, req.user.companyId);
    }

    @Patch(':id')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Update a user (COMPANY_ADMIN+)' })
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
        return this.usersService.update(id, req.user.companyId, updateUserDto);
    }

    @Delete(':id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a user (COMPANY_ADMIN+)' })
    remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
        return this.usersService.remove(id, req.user.companyId);
    }
}
