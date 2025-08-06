import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { Auth0Module } from '../auth0/auth0.module';
import { User } from './entities/user.entity';
import { UserSyncService } from './services/user-sync.service';
import { UserService } from './services/user.service';
import { UserController } from './user.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([User]),
		AppConfigModule,
		forwardRef(() => Auth0Module),
	],
	controllers: [UserController],
	providers: [UserService, UserSyncService],
	exports: [UserService, UserSyncService],
})
export class UserModule {}
