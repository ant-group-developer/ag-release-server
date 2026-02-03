import { PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class SftpMetadata {
	@IsString()
	host: string; // sftp host

	@IsNumber()
	port: number; // sftp port, ví dụ 22

	@IsString()
	username: string;

	@IsOptional()
	password?: string; // nên encrypt khi lưu DB

	@IsOptional()
	privateKey?: string;

	@IsOptional()
	path?: string;
}

export class PartialTestConnectionDto extends PartialType(SftpMetadata) {}
