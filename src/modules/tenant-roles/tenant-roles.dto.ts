import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsUUID, ValidateNested } from 'class-validator';

export class RoleStatusDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID('4')
	roleId: string;

	@ApiProperty()
	@IsBoolean()
	isActive: boolean;
}

export class UpdateTenantRolesDto {
	@ApiProperty({ type: [RoleStatusDto] })
	@ValidateNested({ each: true })
	@Type(() => RoleStatusDto)
	data: RoleStatusDto[];
}
