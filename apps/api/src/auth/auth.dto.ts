import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../common/transforms';

export class RegisterDto {
  @ApiProperty({ example: 'james@unicom.vn' })
  @Trim() @IsEmail() @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString() @MinLength(8) @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'James' })
  @Trim() @IsString() @IsNotEmpty() @MaxLength(120)
  displayName: string;

  @ApiPropertyOptional({ description: 'Nếu có, tạo luôn workspace và đặt người đăng ký làm admin.', example: 'UNICOM Workspace' })
  @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120)
  workspaceName?: string;
}

export class LoginDto {
  @ApiProperty() @Trim() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(128) password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(256) refreshToken: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ description: 'Số giây access token còn hiệu lực' }) expiresIn: number;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
}

export class UserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() displayName: string;
  @ApiProperty() isPlatformAdmin: boolean;
  @ApiProperty() locale: string;
}

export class AuthResultDto extends TokenPairDto {
  @ApiProperty({ type: UserDto }) user: UserDto;
}
