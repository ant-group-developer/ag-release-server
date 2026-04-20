import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateUserRoleDto {
	@ApiProperty({
		type: 'array',
		items: { type: 'string', format: 'uuid' },
	})
	@IsArray()
	@IsUUID('4', { each: true })
	roleIds: string[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID('4')
	tenantId?: string;
}
