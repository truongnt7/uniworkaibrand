import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { RuntimeService } from './runtime.service';

class ManifestQuery {
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,32}$/) channel?: string;
}

@ApiTags('runtime')
@Controller('runtime')
export class RuntimeController {
  constructor(private readonly svc: RuntimeService) {}

  @Get('manifest')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({
    summary: 'Manifest runtime đã ký (Blender 4.5 LTS + ffmpeg LGPL)',
    description:
      'Phong bì { manifest, signature, keyId }: `manifest` là chuỗi JSON, `signature` là ed25519 (base64) trên đúng chuỗi đó. ' +
      'Client xác minh bằng khóa công khai nhúng sẵn trong app (GET /runtime/public-keys chỉ để tra cứu/đối chiếu).',
  })
  @ApiOkResponse({ schema: { type: 'object', properties: { manifest: { type: 'string' }, signature: { type: 'string' }, keyId: { type: 'string' } } } })
  manifest(@Query() q: ManifestQuery) {
    return this.svc.signedManifest(q.channel ?? 'stable');
  }

  @Get('public-keys')
  @ApiOperation({ summary: 'Khóa công khai đang dùng để ký (để đối chiếu với khóa nhúng trong app)' })
  publicKeys() {
    return this.svc.publicKeys();
  }
}
