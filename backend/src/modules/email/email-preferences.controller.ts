import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import {
  EmailCategory,
  EmailPreferencesService,
} from './email-preferences.service';
import { UpdateEmailPreferencesDto } from './dto/update-email-preferences.dto';

@ApiTags('Email Preferences')
@Controller('email-preferences')
export class EmailPreferencesController {
  constructor(private readonly preferences: EmailPreferencesService) {}

  // ---- In-app (authenticated) --------------------------------------------

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current user email preferences' })
  getMine(@Request() req: AuthenticatedRequest) {
    return this.preferences.getByUserId(req.user.userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update the current user email preferences' })
  updateMine(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateEmailPreferencesDto,
  ) {
    return this.preferences.update(req.user.userId, dto);
  }

  // ---- Token-gated (from email footer links, no login) -------------------

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve current preferences from an email token' })
  resolve(@Query('token') token: string) {
    const userId = this.preferences.verifyToken(token || '');
    if (!userId) {
      return { valid: false };
    }
    return this.preferences
      .getByUserId(userId)
      .then((prefs) => ({ valid: true, preferences: prefs }));
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'One-click unsubscribe from a category via token' })
  unsubscribe(
    @Body('token') token: string,
    @Body('category') category: EmailCategory,
  ) {
    return this.preferences.unsubscribeByToken(token, category);
  }

  @Patch('by-token')
  @ApiOperation({ summary: 'Update preferences via an email token' })
  updateByToken(
    @Body('token') token: string,
    @Body() dto: UpdateEmailPreferencesDto,
  ) {
    const userId = this.preferences.verifyToken(token || '');
    if (!userId) {
      return { valid: false };
    }
    return this.preferences
      .update(userId, dto)
      .then((preferences) => ({ valid: true, preferences }));
  }
}
