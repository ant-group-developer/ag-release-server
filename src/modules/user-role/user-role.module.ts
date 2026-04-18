import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { UserRoleController } from './user-role.controller';
import { UserRole } from './user-role.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([UserRole]),
		AccessControlModule,
	],
	controllers: [UserRoleController],
})
export class UserRoleModule {}
