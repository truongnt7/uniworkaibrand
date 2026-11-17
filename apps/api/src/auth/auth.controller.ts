import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthResultDto, LoginDto, RefreshDto, RegisterDto, TokenPairDto, UserDto } from './auth.dto';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import type { AuthUser } from './auth.types';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(STRICT)
  @ApiCreatedResponse({ type: AuthResultDto })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req.headers['user-agent']);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(STRICT)
  @ApiOkResponse({ type: AuthResultDto })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, req.headers['user-agent']);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
