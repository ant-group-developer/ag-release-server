import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum StorageType {
	SFTP = 'SFTP',
	S3 = 'S3',
}
export class SftpMetadata {
	@IsOptional()
	@IsEnum(StorageType)
	type?: StorageType = StorageType.SFTP;

	/**
	 * Common
	 */
	@IsOptional()
	path?: string;

	/**
	 * SFTP only
	 */
	@IsOptional()
	@IsString()
	host: string; // SFTP host

	@IsOptional()
	@IsNumber()
	port: number; // SFTP port, ví dụ 22

	@IsOptional()
	@IsString()
	username: string; // SFTP username

	@IsOptional()
	password?: string; // SFTP password

	@IsOptional()
	privateKey?: string; // SFTP private key

	/**
	 * S3 only
	 */
	@IsOptional()
	@IsString()
	bucket?: string; // S3 bucket name

	@IsOptional()
	@IsString()
	region?: string; // AWS region

	@IsOptional()
	@IsString()
	accessKeyId?: string; // AWS access key

	@IsOptional()
	@IsString()
	secretAccessKey?: string; // AWS secret key

	@IsOptional()
	@IsString()
	endpoint?: string; // Custom S3 endpoint (MinIO, DigitalOcean Spaces...)
}

export class PartialTestConnectionDto extends PartialType(SftpMetadata) {}
