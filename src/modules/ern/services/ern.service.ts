import { Injectable } from '@nestjs/common';
import { Ern382Builder } from '../builders/ern382.builder';
import { Ern43Builder } from '../builders/ern43.builder';
import { ManifestBuilder } from '../builders/manifest.builder';
import { ErnInput, ErnVersion, ManifestInput } from '../interfaces/ern-input.interface';

@Injectable()
export class ErnService {
	/**
	 * Generate DDEX ERN XML from simplified release + track metadata.
	 * Supports ERN 4.3 and ERN 3.8.2.
	 */
	generate(input: ErnInput): string {
		switch (input.version) {
			case ErnVersion.ERN_43:
				return new Ern43Builder(input).build();
			case ErnVersion.ERN_382:
				return new Ern382Builder(input).build();
			default:
				throw new Error(
					`Unsupported ERN version: ${input.version as string}`,
				);
		}
	}

	/**
	 * Generate DDEX ECHO ManifestMessage (BatchComplete) XML.
	 * Supports ern-c-sftp/17 and echo/11 schemas.
	 */
	generateManifest(input: ManifestInput): string {
		return new ManifestBuilder(input).build();
	}
}
