import { Injectable } from '@nestjs/common';
import { ErnVersion } from '../ern/interfaces/ern-input.interface';
import { ERN382Generator } from './generators/ern382.generator';
import { ERN43Generator } from './generators/ern43.generator';
import {
	DDEXGenerateInput,
	DDEXVersion,
} from './interfaces/ddex-input.interface';

@Injectable()
export class DDEXService {
	/**
	 * Generate DDEX XML from input data
	 * @param input Contains version and data for generation
	 * @returns Generated XML string
	 */
	generate(input: DDEXGenerateInput): string {
		const generator = this.getGenerator(input.version);
		return generator.generate(input.data);
	}

	/**
	 * Get the appropriate generator for the DDEX version
	 */
	private getGenerator(version: DDEXVersion) {
		switch (version) {
			case ErnVersion.ERN_43:
				return new ERN43Generator();
			case ErnVersion.ERN_382:
				return new ERN382Generator();
			default:
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Unsupported DDEX version: ${version}`);
		}
	}
}
