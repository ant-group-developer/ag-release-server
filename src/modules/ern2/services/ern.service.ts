import { Injectable } from '@nestjs/common';
import { Ern382Builder2 } from '../builders/ern382.builder';
import { Ern43Builder2 } from '../builders/ern43.builder';
import { ManifestBuilder } from '../builders/manifest.builder';
import {
	ErnInput2,
	ErnVersion2,
	ManifestInput2,
} from '../interfaces/ern-input.interface';

@Injectable()
export class ErnService2 {
	/**
	 * Generate DDEX ERN XML from simplified release + track metadata.
	 * Supports ERN 4.3 and ERN 3.8.2.
	 */
	generate(input: ErnInput2): string {
		switch (input.version) {
			case ErnVersion2.ERN_43:
				return new Ern43Builder2(input).build();
			case ErnVersion2.ERN_382:
				return new Ern382Builder2(input).build();
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
	generateManifest(input: ManifestInput2): string {
		return new ManifestBuilder(input).build();
	}
}
