import { Module } from '@nestjs/common';
import { JwtModule as NestJwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';

@Module({
	imports: [NestJwtModule],
	providers: [JwtService, JwtAuthGuard],
	exports: [JwtService, JwtAuthGuard],
})
export class JwtModule {}
