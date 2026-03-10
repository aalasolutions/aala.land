import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChequesService } from './cheques.service';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('cheques')
@Controller('cheques')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ChequesController {
  constructor(private readonly chequesService: ChequesService) { }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a cheque record (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateChequeDto, @Request() req: any) {
    return this.chequesService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List cheques (paginated, sorted by due date)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.chequesService.findAll(req.user.companyId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a cheque by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.chequesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a cheque (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChequeDto, @Request() req: any) {
    return this.chequesService.update(id, req.user.companyId, dto);
  }

  @Post(':id/ocr')
  @ApiOperation({ summary: 'Trigger OCR processing for a cheque image' })
  processOcr(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('imageUrl') imageUrl: string,
    @Request() req: any,
  ) {
    return this.chequesService.processOcr(id, req.user.companyId, imageUrl);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a cheque (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.chequesService.remove(id, req.user.companyId);
  }
}
