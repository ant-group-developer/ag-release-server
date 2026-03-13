import { Injectable } from '@nestjs/common';
import { Ern382Builder } from './builders/ern382.builder';
import { Ern43Builder } from './builders/ern43.builder';
import { ErnInput } from './interfaces/ern-input.interface';

@Injectable()
export class ErnService {
	/**
	 * Generate DDEX ERN XML from simplified release + track metadata.
	 * Supports ERN 4.3 and ERN 3.8.2.
	 */
	generate(input: ErnInput): string {
		switch (input.version) {
			case '4.3':
				return new Ern43Builder(input).build();
			case '3.8.2':
				return new Ern382Builder(input).build();
			default:
				throw new Error(
					`Unsupported ERN version: ${input.version as string}`,
				);
		}
	}
}
