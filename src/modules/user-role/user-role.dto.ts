import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class UpdateUserRoleDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID('4')
	userId: string;

	@ApiProperty({
		type: 'array',
		items: { type: 'string', format: 'uuid' },
	})
	@IsArray()
	@IsUUID('4', { each: true })
	roleIds: string[];
}
