import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpsertSourceTypeConfigDto {
	@ApiProperty({ example: 'Merlin' })
	@IsString()
	@IsNotEmpty()
	label: string;

	@ApiPropertyOptional({
		example: 'https://cdn.example.com/analytics-sources/merlin.png',
		nullable: true,
		description: 'Public image URL. Send null to remove the image.',
	})
	@IsOptional()
	@IsUrl({ require_protocol: true })
	imageUrl?: string | null;
}
