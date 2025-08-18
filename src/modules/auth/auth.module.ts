import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';
import { TokenModule } from '../token/token.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { RefreshTokensService } from './refresh-tokens.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([RefreshToken]),
		TokenModule,
		UserModule,
		TenantModule,
	],
	controllers: [AuthController],
	providers: [RefreshTokensService, AuthService],
	exports: [AuthService],
})
export class AuthModule {}
