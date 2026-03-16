import { create } from 'xmlbuilder2';
import {
	ManifestInput,
	ManifestMessageEntry,
} from '../interfaces/ern-input.interface';

/**
 * Builds DDEX ECHO ManifestMessage XML using xmlbuilder2.
 *
 * Supports two schema versions:
 * - ern-c-sftp/17 (default, newer SFTP choreography)
 * - echo/11 (older ECHO format)
 *
 * Based on: samples/ern/batchComplete/
 */
export class ManifestBuilder {
	private static readonly SCHEMAS = {
		'ern-c-sftp/17': {
			namespace: 'http://ddex.net/xml/ern-c-sftp/17',
			schemaLocation:
				'http://ddex.net/xml/ern-c-sftp/17 http://ddex.net/xml/ern-c-sftp/17/ern-choreography-sftp.xsd',
			versionId: '1.7',
		},
		'echo/11': {
			namespace: 'http://ddex.net/xml/2011/echo/11',
			schemaLocation:
				'http://ddex.net/xml/2011/echo/11 http://ddex.net/xml/2011/echo/11/echo.xsd',
			versionId: '2010/ern-main/312',
		},
	} as const;

	constructor(private readonly input: ManifestInput) {}

	build(): string {
		const version = this.input.schemaVersion || 'ern-c-sftp/17';
		const schema = ManifestBuilder.SCHEMAS[version];

		const doc = create({ version: '1.0', encoding: 'UTF-8' });
		const root = doc.ele('echo:ManifestMessage', {
			'xmlns:echo': schema.namespace,
			'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'xsi:schemaLocation': schema.schemaLocation,
			MessageVersionId: schema.versionId,
		});

		this.buildMessageHeader(root);

		root.ele('IsTestFlag').txt(String(this.input.isTestFlag ?? false));

		// Batch-level delivery/product types (echo/11 style)
		if (version === 'echo/11' && this.input.batchDeliveryType) {
			root.ele('DeliveryType', {
				UserDefinedValue: this.input.batchDeliveryType.value,
				Namespace: this.input.batchDeliveryType.namespace,
			}).txt('UserDefined');
		}
		if (version === 'echo/11' && this.input.batchProductType) {
			root.ele('BatchProductType', {
				UserDefinedValue: this.input.batchProductType.value,
				Namespace: this.input.batchProductType.namespace,
			}).txt('UserDefined');
		}

		root.ele('RootDirectory').txt(this.input.rootDirectory || './');
		root.ele('NumberOfMessages').txt(String(this.input.messages.length));

		for (const msg of this.input.messages) {
			this.buildMessageInBatch(root, msg, version);
		}

		return doc.end({ prettyPrint: true, indent: '  ' });
	}

	private buildMessageHeader(root: ReturnType<typeof create>): void {
		const header = root.ele('MessageHeader');

		const sender = header.ele('MessageSender');
		sender.ele('PartyId').txt(this.input.sender.partyId);
		sender.ele('PartyName').ele('FullName').txt(this.input.sender.name);

		const recipient = header.ele('MessageRecipient');
		recipient.ele('PartyId').txt(this.input.recipient.partyId);
		recipient
			.ele('PartyName')
			.ele('FullName')
			.txt(this.input.recipient.name);

		header
			.ele('MessageCreatedDateTime')
			.txt(this.input.createdDateTime || new Date().toISOString());
	}

	private buildMessageInBatch(
		root: ReturnType<typeof create>,
		msg: ManifestMessageEntry,
		version: string,
	): void {
		const mib = root.ele('MessageInBatch');

		mib.ele('MessageType').txt(msg.messageType || 'NewReleaseMessage');
		mib.ele('MessageId').txt(msg.messageId);
		mib.ele('URL').txt(msg.url);

		// IncludedReleaseId
		const rid = mib.ele('IncludedReleaseId');

		if (msg.releaseId.grid !== undefined) {
			rid.ele('GRid').txt(msg.releaseId.grid);
		}
		if (msg.releaseId.icpn) {
			const icpnAttrs: Record<string, string> = {};
			if (msg.releaseId.isEan) {
				icpnAttrs.IsEan = 'true';
			}
			rid.ele('ICPN', icpnAttrs).txt(msg.releaseId.icpn);
		}
		if (msg.releaseId.proprietaryId) {
			rid.ele('ProprietaryId', {
				Namespace: msg.releaseId.proprietaryId.namespace,
			}).txt(msg.releaseId.proprietaryId.value);
		}

		// Per-message delivery/product types (ern-c-sftp/17 only)
		if (version === 'ern-c-sftp/17') {
			if (msg.deliveryType) {
				mib.ele('DeliveryType').txt(msg.deliveryType);
			}
			if (msg.productType) {
				mib.ele('ProductType').txt(msg.productType);
			}
		}

		// HashSum
		if (msg.hashSum) {
			const hash = mib.ele('HashSum');
			if (version === 'ern-c-sftp/17') {
				hash.ele('HashSumValue').txt(msg.hashSum.value);
			} else {
				hash.ele('HashSum').txt(msg.hashSum.value);
			}
			hash.ele('HashSumAlgorithmType').txt(msg.hashSum.algorithm);
		}
	}
}
