// src/modules/ern/ern-validate.service.ts
import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ValidateErnDto } from '../validate-ern.dto';

@Injectable()
export class ErnValidateService {
	private readonly validateUrl = 'https://api.ddex-workbench.org/v1/validate';

	async validateFromFile(dto: ValidateErnDto) {
		const content = await this.readXmlFromLocal(dto.filePath);

		const response = await fetch(this.validateUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content,
				type: 'ERN',
				version: dto.version || '4.3',
			}),
		});

		const result = await response.json().catch(() => null);

		if (!response.ok) {
			throw new BadRequestException({
				message: 'Validate ERN failed',
				statusCode: response.status,
				error: result,
			});
		}

		return {
			success: true,
			filePath: dto.filePath,
			valid: result?.valid ?? false,
			data: result,
		};
	}

	private async readXmlFromLocal(filePath: string): Promise<string> {
		if (!filePath) {
			throw new BadRequestException('filePath is required');
		}

		const resolvedPath = path.resolve(filePath);

		try {
			const fileBuffer = await fs.readFile(resolvedPath);
			const content = fileBuffer.toString('utf-8').trim();

			if (!content) {
				throw new BadRequestException('File is empty');
			}

			return content;
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}

			throw new InternalServerErrorException({
				message: 'Cannot read file from local machine',
				filePath: resolvedPath,
			});
		}
	}
}
