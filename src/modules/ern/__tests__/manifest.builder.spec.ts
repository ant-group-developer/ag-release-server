import { ManifestBuilder } from '../builders/manifest.builder';
import { ManifestInput } from '../interfaces/ern-input.interface';

describe('ManifestBuilder', () => {
	describe('ern-c-sftp/17 (default)', () => {
		const input: ManifestInput = {
			sender: {
				partyId: 'PADPIDA20090302015',
				name: 'Consolidated Independent Ltd',
			},
			recipient: {
				partyId: 'PADPIDA1234567890',
				name: 'TestDSP',
			},
			createdDateTime: '2020-02-13T07:04:10Z',
			isTestFlag: false,
			messages: [
				{
					messageId: '61704438710266',
					url: './5057805503736/5057805503736.xml',
					releaseId: {
						grid: 'A10341T0000029FTAH',
						icpn: '5057805503736',
						proprietaryId: {
							namespace: 'PADPIDA20090302015',
							value: '61533793000032',
						},
					},
					deliveryType: 'NewReleaseDelivery',
					productType: 'AudioProduct',
					hashSum: {
						value: 'L6CQ54m3s1AYEDhVNj+D7Myhk94',
						algorithm: 'SHA1',
					},
				},
			],
		};

		let xml: string;

		beforeAll(() => {
			xml = new ManifestBuilder(input).build();
		});

		it('should produce valid XML declaration', () => {
			expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		});

		it('should have ern-c-sftp/17 namespace', () => {
			expect(xml).toContain(
				'xmlns:echo="http://ddex.net/xml/ern-c-sftp/17"',
			);
			expect(xml).toContain('MessageVersionId="1.7"');
		});

		it('should contain MessageHeader with sender and recipient', () => {
			expect(xml).toContain('<MessageHeader>');
			expect(xml).toContain(
				'<PartyId>PADPIDA20090302015</PartyId>',
			);
			expect(xml).toContain(
				'<FullName>Consolidated Independent Ltd</FullName>',
			);
			expect(xml).toContain(
				'<PartyId>PADPIDA1234567890</PartyId>',
			);
			expect(xml).toContain('<FullName>TestDSP</FullName>');
		});

		it('should contain IsTestFlag', () => {
			expect(xml).toContain(
				'<IsTestFlag>false</IsTestFlag>',
			);
		});

		it('should contain RootDirectory', () => {
			expect(xml).toContain('<RootDirectory>./</RootDirectory>');
		});

		it('should contain NumberOfMessages', () => {
			expect(xml).toContain(
				'<NumberOfMessages>1</NumberOfMessages>',
			);
		});

		it('should contain MessageInBatch', () => {
			expect(xml).toContain('<MessageInBatch>');
			expect(xml).toContain(
				'<MessageType>NewReleaseMessage</MessageType>',
			);
			expect(xml).toContain(
				'<MessageId>61704438710266</MessageId>',
			);
			expect(xml).toContain(
				'<URL>./5057805503736/5057805503736.xml</URL>',
			);
		});

		it('should contain IncludedReleaseId with GRid, ICPN, ProprietaryId', () => {
			expect(xml).toContain('<IncludedReleaseId>');
			expect(xml).toContain(
				'<GRid>A10341T0000029FTAH</GRid>',
			);
			expect(xml).toContain('<ICPN>5057805503736</ICPN>');
			expect(xml).toContain(
				'Namespace="PADPIDA20090302015"',
			);
			expect(xml).toContain('>61533793000032</ProprietaryId>');
		});

		it('should contain DeliveryType and ProductType per message', () => {
			expect(xml).toContain(
				'<DeliveryType>NewReleaseDelivery</DeliveryType>',
			);
			expect(xml).toContain(
				'<ProductType>AudioProduct</ProductType>',
			);
		});

		it('should use HashSumValue for ern-c-sftp/17', () => {
			expect(xml).toContain(
				'<HashSumValue>L6CQ54m3s1AYEDhVNj+D7Myhk94</HashSumValue>',
			);
			expect(xml).toContain(
				'<HashSumAlgorithmType>SHA1</HashSumAlgorithmType>',
			);
		});
	});

	describe('echo/11', () => {
		const input: ManifestInput = {
			schemaVersion: 'echo/11',
			sender: {
				partyId: 'PADPIDA20090302015',
				name: 'Consolidated Independent',
			},
			recipient: {
				partyId: 'PADPIDA2006111001O',
				name: 'VPD',
			},
			createdDateTime: '2011-03-28T15:11:34+00:00',
			isTestFlag: false,
			batchDeliveryType: {
				value: 'Mixed',
				namespace: 'PADPIDA20090302015',
			},
			batchProductType: {
				value: 'Mixed',
				namespace: 'PADPIDA20090302015',
			},
			messages: [
				{
					messageId: '8320266',
					url: './5055396205022/5055396205022.xml',
					releaseId: {
						grid: '',
						icpn: '5055396205022',
						isEan: true,
						proprietaryId: {
							namespace: 'PADPIDA20090302015',
							value: '7290032',
						},
					},
					hashSum: {
						value: '1kfLIao6Cjseu5kJUPLlVd6Hy70',
						algorithm: 'SHA1',
					},
				},
			],
		};

		let xml: string;

		beforeAll(() => {
			xml = new ManifestBuilder(input).build();
		});

		it('should have echo/11 namespace', () => {
			expect(xml).toContain(
				'xmlns:echo="http://ddex.net/xml/2011/echo/11"',
			);
			expect(xml).toContain(
				'MessageVersionId="2010/ern-main/312"',
			);
		});

		it('should contain batch-level DeliveryType with UserDefined', () => {
			expect(xml).toContain('UserDefinedValue="Mixed"');
			expect(xml).toContain('>UserDefined</DeliveryType>');
		});

		it('should contain BatchProductType', () => {
			expect(xml).toContain('>UserDefined</BatchProductType>');
		});

		it('should have IsEan attribute on ICPN', () => {
			expect(xml).toContain('IsEan="true"');
		});

		it('should use HashSum (not HashSumValue) for echo/11', () => {
			expect(xml).toContain(
				'<HashSum>1kfLIao6Cjseu5kJUPLlVd6Hy70</HashSum>',
			);
			expect(xml).not.toContain('<HashSumValue>');
		});

		it('should contain empty GRid element', () => {
			expect(xml).toContain('<GRid/>');
		});
	});

	describe('multiple messages', () => {
		const input: ManifestInput = {
			sender: { partyId: 'SENDER001', name: 'Sender' },
			recipient: { partyId: 'RECIPIENT001', name: 'Recipient' },
			createdDateTime: '2025-01-01T00:00:00Z',
			messages: [
				{
					messageId: 'MSG1',
					url: './release1/release1.xml',
					releaseId: { icpn: '1111111111111' },
				},
				{
					messageId: 'MSG2',
					url: './release2/release2.xml',
					releaseId: { icpn: '2222222222222' },
				},
			],
		};

		let xml: string;

		beforeAll(() => {
			xml = new ManifestBuilder(input).build();
		});

		it('should have correct NumberOfMessages', () => {
			expect(xml).toContain(
				'<NumberOfMessages>2</NumberOfMessages>',
			);
		});

		it('should contain both messages', () => {
			expect(xml).toContain('<MessageId>MSG1</MessageId>');
			expect(xml).toContain('<MessageId>MSG2</MessageId>');
			expect(xml).toContain('<ICPN>1111111111111</ICPN>');
			expect(xml).toContain('<ICPN>2222222222222</ICPN>');
		});
	});
});
