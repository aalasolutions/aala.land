import { Controller, Post, Body, UnauthorizedException, Get, UseGuards, Request, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ImpersonateService } from './impersonate.service';
import { AuthGoogleService } from './auth-google.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleSignupDto } from './dto/google-signup.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly authService: AuthService,
        private readonly impersonateService: ImpersonateService,
        private readonly googleService: AuthGoogleService,
    ) { }

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Register a new company and admin user' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login with email and password' })
    async login(@Body() loginDto: LoginDto) {
        const user = await this.authService.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.authService.login(user);
    }

    @Post('google')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login with Google ID token for an existing account' })
    async googleLogin(@Body() dto: GoogleLoginDto) {
        return this.googleService.googleLogin(dto.idToken);
    }

    @Post('google/signup')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Sign up with Google and create a company admin account' })
    async googleSignup(@Body() dto: GoogleSignupDto) {
        return this.googleService.googleSignup(
            dto.idToken,
            dto.companyName,
            dto.regionCode,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('google/link')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Link Google account to current user' })
    async linkGoogleAccount(
        @Request() req: AuthenticatedRequest,
        @Body() dto: GoogleLoginDto,
    ) {
        return this.googleService.linkGoogleAccount(req.user.userId, dto.idToken);
    }

    @UseGuards(JwtAuthGuard)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Refresh access token' })
    async refresh(@Request() req: AuthenticatedRequest) {
        return this.authService.refresh(req.user);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Logout (client should discard token)' })
    async logout() {
        return { message: 'Logged out successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user profile' })
    getProfile(@Request() req: AuthenticatedRequest) {
        return req.user;
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request a password reset token' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset password using a valid token' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto.token, dto.newPassword);
    }

    @Post('impersonate')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Impersonate another user - SUPER_ADMIN only' })
    async impersonate(@Request() req: AuthenticatedRequest, @Body() payload: ImpersonateDto) {
        const { userId } = payload;
        const user = await this.impersonateService.impersonate(userId);
        this.logger.log(`User ${req.user.userId} impersonated user ${user.sub} (email: ${user.email})`);
        return this.authService.impersonateLogin(user, req.user.userId);
    }
}
