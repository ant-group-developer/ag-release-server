import { Injectable } from '@nestjs/common';
import { ERN43Generator } from './generators/ern43.generator';
import {
	DDEXGenerateInput,
	DDEXVersion,
} from './interfaces/ddex-input.interface';

@Injectable()
export class DDEXService {
	// spotify
	genDdexSpotify() {
		this.generate({
			version: '4.3',
			data: {
				messageHeader: {
					messageId: '',
					messageThreadId: 'Baseline',
					sender: {
						partyId: '',
						partyName: '',
					},
					recipient: {
						partyId: '',
						partyName: '',
					},
				},
				parties: [],
				resources: [],
				releases: [],
				deals: [],
			},
		});
	}

	// private
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
			case '4.3':
				return new ERN43Generator();
			case '3.8.2':
				throw new Error('ERN 3.8.2 generator not yet implemented');
			default:
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Unsupported DDEX version: ${version}`);
		}
	}

	// private getDataHeader(): DDEXMessageHeader {
	// 	return {
	// 		messageThreadId: 'Baseline',
	// 		messageId: Date.now().toString(),
	// 		sender: this.sender,
	// 		recipient: this.recipient,
	// 		createdDateTime: new Date().toISOString(),
	// 	};
	// }
}
