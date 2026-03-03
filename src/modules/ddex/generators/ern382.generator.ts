import {
	DDEXCopyrightLine,
	DDEXData,
	DDEXDeal,
	DDEXDisplayArtist,
	DDEXIndirectResourceContributor,
	DDEXMessageHeader,
	DDEXRelease,
	DDEXResource,
	DDEXResourceContributor,
	DDEXTechnicalDetails,
} from '../interfaces/ddex-input.interface';
import {
	element,
	escapeXml,
	formatDateTime,
	indent,
	xmlDeclaration,
} from '../utils/xml.utils';

/**
 * ERN 3.8.2 Generator
 * Generates NewReleaseMessage XML according to ERN 3.8.2 specification
 * Supports: add (OriginalMessage), full update, metadata update, takedown
 */
export class ERN382Generator {
	private readonly namespace = 'http://ddex.net/xml/ern/382';
	private readonly schemaLocation =
		'http://ddex.net/xml/ern/382 http://ddex.net/xml/ern/382/release-notification.xsd';

	/**
	 * Generate complete DDEX ERN 3.8.2 XML
	 */
	generate(data: DDEXData): string {
		const parts: string[] = [
			xmlDeclaration(),
			this.openRootElement(),
			indent(this.buildMessageHeader(data.messageHeader), 2),
			indent(
				element(
					'UpdateIndicator',
					data.updateIndicator || 'OriginalMessage',
				),
				2,
			),
			indent(this.buildResourceList(data.resources), 2),
			indent(this.buildReleaseList(data.releases), 2),
			indent(this.buildDealList(data.deals), 2),
			this.closeRootElement(),
		];

		return parts.join('\n');
	}

	private openRootElement(): string {
		return `<ern:NewReleaseMessage xmlns:ern="${this.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" LanguageAndScriptCode="en" MessageSchemaVersionId="ern/382" ReleaseProfileVersionId="CommonReleaseTypes/10/AudioAlbumMusicOnly" xsi:schemaLocation="${this.schemaLocation}">`;
	}

	private closeRootElement(): string {
		return '</ern:NewReleaseMessage>';
	}

	// ==================== Message Header ====================
	private buildMessageHeader(header: DDEXMessageHeader): string {
		const lines: string[] = [
			'<MessageHeader>',
			`  ${element('MessageThreadId', header.messageThreadId || 'Baseline')}`,
			`  ${element('MessageId', header.messageId)}`,
		];

		// MessageFileName (ERN 3.8.2)
		if (header.messageFileName) {
			lines.push(
				`  ${element('MessageFileName', header.messageFileName)}`,
			);
		}

		// MessageSender
		lines.push(`  <MessageSender>`);
		if (header.sender.isDPID) {
			lines.push(
				`    <PartyId IsDPID="true">${escapeXml(header.sender.partyId)}</PartyId>`,
			);
		} else {
			lines.push(`    ${element('PartyId', header.sender.partyId)}`);
		}
		lines.push(`    <PartyName>`);
		lines.push(`      ${element('FullName', header.sender.partyName)}`);
		lines.push(`    </PartyName>`);
		lines.push(`  </MessageSender>`);

		// MessageRecipient
		lines.push(`  <MessageRecipient>`);
		if (header.recipient.isDPID) {
			lines.push(
				`    <PartyId IsDPID="true">${escapeXml(header.recipient.partyId)}</PartyId>`,
			);
		} else {
			lines.push(`    ${element('PartyId', header.recipient.partyId)}`);
		}
		lines.push(`    <PartyName>`);
		lines.push(`      ${element('FullName', header.recipient.partyName)}`);
		lines.push(`    </PartyName>`);
		lines.push(`  </MessageRecipient>`);

		// MessageCreatedDateTime
		lines.push(
			`  ${element('MessageCreatedDateTime', header.createdDateTime || formatDateTime())}`,
		);

		// MessageControlType (ERN 3.8.2)
		if (header.messageControlType) {
			lines.push(
				`  ${element('MessageControlType', header.messageControlType)}`,
			);
		}

		lines.push('</MessageHeader>');
		return lines.join('\n');
	}

	// ==================== Resource List ====================
	private buildResourceList(resources: DDEXResource[]): string {
		const resourceElements = resources.map((res) => {
			switch (res.type) {
				case 'SoundRecording':
					return this.buildSoundRecording(res);
				case 'Image':
					return this.buildImage(res);
				case 'Text':
					return this.buildText(res);
				default:
					return '';
			}
		});
		return `<ResourceList>\n${indent(resourceElements.join('\n'), 2)}\n</ResourceList>`;
	}

	private buildSoundRecording(resource: DDEXResource): string {
		const lines: string[] = [
			'<SoundRecording>',
			`  ${element('SoundRecordingType', resource.soundRecordingType || 'MusicalWorkSoundRecording')}`,
		];

		// IsArtistRelated
		lines.push(
			`  ${element('IsArtistRelated', resource.isArtistRelated ? 'true' : 'false')}`,
		);

		// SoundRecordingId (ISRC)
		if (resource.isrc) {
			lines.push(`  <SoundRecordingId>`);
			lines.push(`    ${element('ISRC', resource.isrc)}`);
			lines.push(`  </SoundRecordingId>`);
		}

		// ResourceReference
		lines.push(`  ${element('ResourceReference', resource.reference)}`);

		// ReferenceTitle
		if (resource.title) {
			lines.push(`  <ReferenceTitle>`);
			lines.push(`    ${element('TitleText', resource.title)}`);
			if (resource.subTitle) {
				lines.push(`    ${element('SubTitle', resource.subTitle)}`);
			}
			lines.push(`  </ReferenceTitle>`);
		}

		// LanguageOfPerformance
		if (resource.languageOfPerformance) {
			lines.push(
				`  ${element('LanguageOfPerformance', resource.languageOfPerformance)}`,
			);
		}

		// Duration
		if (resource.duration) {
			lines.push(`  ${element('Duration', resource.duration)}`);
		}

		// SoundRecordingDetailsByTerritory
		lines.push(this.buildSoundRecordingDetailsByTerritory(resource, 2));

		lines.push('</SoundRecording>');
		return lines.join('\n');
	}

	private buildSoundRecordingDetailsByTerritory(
		resource: DDEXResource,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [`${pad}<SoundRecordingDetailsByTerritory>`];

		// TerritoryCode
		const territories = resource.territoryCodes || [
			resource.applicableTerritoryCode || 'Worldwide',
		];
		for (const territory of territories) {
			lines.push(`${pad}  ${element('TerritoryCode', territory)}`);
		}

		// Titles (FormalTitle + DisplayTitle)
		if (resource.title) {
			lines.push(`${pad}  <Title TitleType="FormalTitle">`);
			lines.push(`${pad}    ${element('TitleText', resource.title)}`);
			if (resource.subTitle) {
				lines.push(
					`${pad}    ${element('SubTitle', resource.subTitle)}`,
				);
			}
			lines.push(`${pad}  </Title>`);
			lines.push(`${pad}  <Title TitleType="DisplayTitle">`);
			lines.push(`${pad}    ${element('TitleText', resource.title)}`);
			if (resource.subTitle) {
				lines.push(
					`${pad}    ${element('SubTitle', resource.subTitle)}`,
				);
			}
			lines.push(`${pad}  </Title>`);
		}

		// DisplayArtists (inline with PartyName)
		if (resource.displayArtists) {
			for (const artist of resource.displayArtists) {
				lines.push(this.buildDisplayArtist382(artist, indentLevel + 2));
			}
		}

		// ResourceContributors
		if (resource.resourceContributors) {
			for (const contrib of resource.resourceContributors) {
				lines.push(
					this.buildResourceContributor(contrib, indentLevel + 2),
				);
			}
		}

		// IndirectResourceContributors
		if (resource.indirectResourceContributors) {
			for (const contrib of resource.indirectResourceContributors) {
				lines.push(
					this.buildIndirectResourceContributor(
						contrib,
						indentLevel + 2,
					),
				);
			}
		}

		// PLine
		if (resource.pLine) {
			lines.push(
				this.buildCopyrightLine(
					'PLine',
					resource.pLine,
					indentLevel + 2,
				),
			);
		}

		// SequenceNumber
		if (resource.sequenceNumber !== undefined) {
			lines.push(
				`${pad}  ${element('SequenceNumber', resource.sequenceNumber.toString())}`,
			);
		}

		// Genre
		if (resource.genre) {
			lines.push(`${pad}  <Genre>`);
			lines.push(`${pad}    ${element('GenreText', resource.genre)}`);
			if (resource.subGenre) {
				lines.push(
					`${pad}    ${element('SubGenre', resource.subGenre)}`,
				);
			}
			lines.push(`${pad}  </Genre>`);
		}

		// ParentalWarningType
		lines.push(
			`${pad}  ${element('ParentalWarningType', resource.parentalWarningType || 'NotExplicit')}`,
		);

		// TechnicalSoundRecordingDetails
		if (resource.technicalDetails) {
			lines.push(
				this.buildTechnicalSoundRecordingDetails(
					resource.technicalDetails,
					indentLevel + 2,
				),
			);
		}

		lines.push(`${pad}</SoundRecordingDetailsByTerritory>`);
		return lines.join('\n');
	}

	private buildTechnicalSoundRecordingDetails(
		details: DDEXTechnicalDetails,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [
			`${pad}<TechnicalSoundRecordingDetails>`,
			`${pad}  ${element('TechnicalResourceDetailsReference', details.reference)}`,
		];

		if (details.audioCodecType) {
			lines.push(
				`${pad}  ${element('AudioCodecType', details.audioCodecType)}`,
			);
		}

		if (details.bitRate !== undefined) {
			lines.push(
				`${pad}  <BitRate UnitOfMeasure="kbps">${details.bitRate}</BitRate>`,
			);
		}

		if (details.numberOfChannels) {
			lines.push(
				`${pad}  ${element('NumberOfChannels', details.numberOfChannels)}`,
			);
		}

		if (details.samplingRate !== undefined) {
			lines.push(
				`${pad}  <SamplingRate UnitOfMeasure="Hz">${details.samplingRate}</SamplingRate>`,
			);
		}

		if (details.bitsPerSample !== undefined) {
			lines.push(
				`${pad}  ${element('BitsPerSample', details.bitsPerSample.toString())}`,
			);
		}

		// File
		const fileName = details.fileName || details.fileUri;
		const filePath = details.filePath || '';
		lines.push(`${pad}  <File>`);
		lines.push(`${pad}    ${element('FileName', fileName)}`);
		if (filePath) {
			lines.push(`${pad}    ${element('FilePath', filePath)}`);
		}
		if (details.hashSum) {
			lines.push(`${pad}    <HashSum>`);
			lines.push(`${pad}      ${element('HashSum', details.hashSum)}`);
			lines.push(
				`${pad}      ${element('HashSumAlgorithmType', details.hashSumAlgorithmType || 'MD5')}`,
			);
			lines.push(`${pad}    </HashSum>`);
		}
		lines.push(`${pad}  </File>`);

		lines.push(`${pad}</TechnicalSoundRecordingDetails>`);
		return lines.join('\n');
	}

	private buildImage(resource: DDEXResource): string {
		const lines: string[] = [
			'<Image>',
			`  ${element('ImageType', resource.imageType || 'FrontCoverImage')}`,
		];

		// ImageId
		if (resource.technicalDetails || resource.isrc) {
			lines.push(`  <ImageId>`);
			const namespace = resource.technicalDetails?.reference
				? `DPID:${resource.technicalDetails.reference.replace('T_cover_', '')}`
				: '';
			const idValue = resource.isrc || `Pid${resource.reference}`;
			lines.push(
				`    <ProprietaryId Namespace="${escapeXml(namespace)}">${escapeXml(idValue)}</ProprietaryId>`,
			);
			lines.push(`  </ImageId>`);
		}

		// ResourceReference
		lines.push(`  ${element('ResourceReference', resource.reference)}`);

		// ImageDetailsByTerritory
		lines.push(this.buildImageDetailsByTerritory(resource, 2));

		lines.push('</Image>');
		return lines.join('\n');
	}

	private buildImageDetailsByTerritory(
		resource: DDEXResource,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [`${pad}<ImageDetailsByTerritory>`];

		// TerritoryCode
		const territories = resource.territoryCodes || [
			resource.applicableTerritoryCode || 'Worldwide',
		];
		for (const territory of territories) {
			lines.push(`${pad}  ${element('TerritoryCode', territory)}`);
		}

		// ParentalWarningType
		lines.push(
			`${pad}  ${element('ParentalWarningType', resource.parentalWarningType || 'NotExplicit')}`,
		);

		// TechnicalImageDetails
		if (resource.technicalDetails) {
			lines.push(
				this.buildTechnicalImageDetails(resource, indentLevel + 2),
			);
		}

		lines.push(`${pad}</ImageDetailsByTerritory>`);
		return lines.join('\n');
	}

	private buildTechnicalImageDetails(
		resource: DDEXResource,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const details = resource.technicalDetails!;
		const lines: string[] = [
			`${pad}<TechnicalImageDetails>`,
			`${pad}  ${element('TechnicalResourceDetailsReference', details.reference)}`,
		];

		if (resource.imageCodecType) {
			lines.push(
				`${pad}  ${element('ImageCodecType', resource.imageCodecType)}`,
			);
		}

		if (resource.imageHeight !== undefined) {
			lines.push(
				`${pad}  ${element('ImageHeight', resource.imageHeight.toString())}`,
			);
		}

		if (resource.imageWidth !== undefined) {
			lines.push(
				`${pad}  ${element('ImageWidth', resource.imageWidth.toString())}`,
			);
		}

		// File
		const fileName = details.fileName || details.fileUri;
		const filePath = details.filePath || '';
		lines.push(`${pad}  <File>`);
		lines.push(`${pad}    ${element('FileName', fileName)}`);
		if (filePath) {
			lines.push(`${pad}    ${element('FilePath', filePath)}`);
		}
		if (details.hashSum) {
			lines.push(`${pad}    <HashSum>`);
			lines.push(`${pad}      ${element('HashSum', details.hashSum)}`);
			lines.push(
				`${pad}      ${element('HashSumAlgorithmType', details.hashSumAlgorithmType || 'MD5')}`,
			);
			lines.push(`${pad}    </HashSum>`);
		}
		lines.push(`${pad}  </File>`);

		lines.push(`${pad}</TechnicalImageDetails>`);
		return lines.join('\n');
	}

	private buildText(resource: DDEXResource): string {
		const lines: string[] = [
			'<Text>',
			`  ${element('TextType', resource.textType || 'LyricText')}`,
			`  ${element('ResourceReference', resource.reference)}`,
		];

		// TextDetailsByTerritory
		lines.push(this.buildTextDetailsByTerritory(resource, 2));

		lines.push('</Text>');
		return lines.join('\n');
	}

	private buildTextDetailsByTerritory(
		resource: DDEXResource,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [`${pad}<TextDetailsByTerritory>`];

		// TerritoryCode
		const territories = resource.territoryCodes || [
			resource.applicableTerritoryCode || 'Worldwide',
		];
		for (const territory of territories) {
			lines.push(`${pad}  ${element('TerritoryCode', territory)}`);
		}

		// TechnicalTextDetails
		if (resource.technicalDetails) {
			const details = resource.technicalDetails;
			lines.push(`${pad}  <TechnicalTextDetails>`);
			lines.push(
				`${pad}    ${element('TechnicalResourceDetailsReference', details.reference)}`,
			);
			const fileName = details.fileName || details.fileUri;
			const filePath = details.filePath || '';
			lines.push(`${pad}    <File>`);
			lines.push(`${pad}      ${element('FileName', fileName)}`);
			if (filePath) {
				lines.push(`${pad}      ${element('FilePath', filePath)}`);
			}
			if (details.hashSum) {
				lines.push(`${pad}      <HashSum>`);
				lines.push(
					`${pad}        ${element('HashSum', details.hashSum)}`,
				);
				lines.push(
					`${pad}        ${element('HashSumAlgorithmType', details.hashSumAlgorithmType || 'MD5')}`,
				);
				lines.push(`${pad}      </HashSum>`);
			}
			lines.push(`${pad}    </File>`);
			lines.push(`${pad}  </TechnicalTextDetails>`);
		}

		lines.push(`${pad}</TextDetailsByTerritory>`);
		return lines.join('\n');
	}

	// ==================== Helper builders ====================
	private buildDisplayArtist382(
		artist: DDEXDisplayArtist,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const langAttr = artist.applicableTerritoryCode
			? ` LanguageAndScriptCode="${escapeXml(artist.applicableTerritoryCode)}"`
			: '';
		return [
			`${pad}<DisplayArtist SequenceNumber="${artist.sequenceNumber}">`,
			`${pad}  <PartyName${langAttr}>`,
			`${pad}    ${element('FullName', artist.artisticName || artist.partyRef)}`,
			`${pad}  </PartyName>`,
			`${pad}  ${element('ArtistRole', artist.role)}`,
			`${pad}</DisplayArtist>`,
		].join('\n');
	}

	private buildResourceContributor(
		contributor: DDEXResourceContributor,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const langAttr = contributor.languageAndScriptCode
			? ` LanguageAndScriptCode="${escapeXml(contributor.languageAndScriptCode)}"`
			: '';
		return [
			`${pad}<ResourceContributor SequenceNumber="${contributor.sequenceNumber}">`,
			`${pad}  <PartyName${langAttr}>`,
			`${pad}    ${element('FullName', contributor.fullName)}`,
			`${pad}  </PartyName>`,
			`${pad}  ${element('ResourceContributorRole', contributor.role)}`,
			`${pad}</ResourceContributor>`,
		].join('\n');
	}

	private buildIndirectResourceContributor(
		contributor: DDEXIndirectResourceContributor,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const langAttr = contributor.languageAndScriptCode
			? ` LanguageAndScriptCode="${escapeXml(contributor.languageAndScriptCode)}"`
			: '';

		const roleElement =
			contributor.role === 'UserDefined' && contributor.userDefinedValue
				? `<IndirectResourceContributorRole UserDefinedValue="${escapeXml(contributor.userDefinedValue)}">UserDefined</IndirectResourceContributorRole>`
				: element('IndirectResourceContributorRole', contributor.role);

		return [
			`${pad}<IndirectResourceContributor>`,
			`${pad}  <PartyName${langAttr}>`,
			`${pad}    ${element('FullName', contributor.fullName)}`,
			`${pad}  </PartyName>`,
			`${pad}  ${roleElement}`,
			`${pad}</IndirectResourceContributor>`,
		].join('\n');
	}

	private buildCopyrightLine(
		type: 'PLine' | 'CLine',
		line: DDEXCopyrightLine,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		return [
			`${pad}<${type}>`,
			`${pad}  ${element('Year', line.year.toString())}`,
			`${pad}  ${element(`${type}Text`, line.text)}`,
			`${pad}</${type}>`,
		].join('\n');
	}

	// ==================== Release List ====================
	private buildReleaseList(releases: DDEXRelease[]): string {
		const releaseElements = releases.map((release) =>
			release.isMainRelease || release.reference === 'R0'
				? this.buildMainRelease(release)
				: this.buildTrackRelease382(release),
		);
		return `<ReleaseList>\n${indent(releaseElements.join('\n'), 2)}\n</ReleaseList>`;
	}

	private buildMainRelease(release: DDEXRelease): string {
		const lines: string[] = ['<Release IsMainRelease="true">'];

		// ReleaseId
		lines.push(`  <ReleaseId>`);
		if (release.isEan !== undefined) {
			lines.push(
				`    <ICPN IsEan="${release.isEan ? 'true' : 'false'}">${escapeXml(release.icpn)}</ICPN>`,
			);
		} else {
			lines.push(`    ${element('ICPN', release.icpn)}`);
		}
		lines.push(`  </ReleaseId>`);

		// ReleaseReference
		lines.push(`  ${element('ReleaseReference', release.reference)}`);

		// ReferenceTitle
		lines.push(`  <ReferenceTitle>`);
		lines.push(`    ${element('TitleText', release.title)}`);
		if (release.subTitle) {
			lines.push(`    ${element('SubTitle', release.subTitle)}`);
		}
		lines.push(`  </ReferenceTitle>`);

		// ReleaseResourceReferenceList
		if (release.resourceRefs && release.resourceRefs.length > 0) {
			lines.push(`  <ReleaseResourceReferenceList>`);
			for (let i = 0; i < release.resourceRefs.length; i++) {
				const refType =
					i === 0 ? 'PrimaryResource' : 'SecondaryResource';
				lines.push(
					`    <ReleaseResourceReference ReleaseResourceType="${refType}">${escapeXml(release.resourceRefs[i])}</ReleaseResourceReference>`,
				);
			}
			lines.push(`  </ReleaseResourceReferenceList>`);
		}

		// ReleaseType
		lines.push(`  ${element('ReleaseType', release.type)}`);

		// ReleaseDetailsByTerritory
		lines.push(this.buildReleaseDetailsByTerritory(release, 2));

		// PLine
		if (release.pLine) {
			lines.push(this.buildCopyrightLine('PLine', release.pLine, 2));
		}

		// CLine
		if (release.cLine) {
			lines.push(this.buildCopyrightLine('CLine', release.cLine, 2));
		}

		lines.push('</Release>');
		return lines.join('\n');
	}

	private buildTrackRelease382(release: DDEXRelease): string {
		const lines: string[] = ['<Release>'];

		// ReleaseId (ISRC for track releases)
		lines.push(`  <ReleaseId>`);
		if (release.isrc) {
			lines.push(`    ${element('ISRC', release.isrc)}`);
		}
		lines.push(`  </ReleaseId>`);

		// ReleaseReference
		lines.push(`  ${element('ReleaseReference', release.reference)}`);

		// ReferenceTitle
		lines.push(`  <ReferenceTitle>`);
		lines.push(`    ${element('TitleText', release.title)}`);
		if (release.subTitle) {
			lines.push(`    ${element('SubTitle', release.subTitle)}`);
		}
		lines.push(`  </ReferenceTitle>`);

		// ReleaseResourceReferenceList
		if (release.resourceRefs && release.resourceRefs.length > 0) {
			lines.push(`  <ReleaseResourceReferenceList>`);
			for (let i = 0; i < release.resourceRefs.length; i++) {
				const refType =
					i === 0 ? 'PrimaryResource' : 'SecondaryResource';
				lines.push(
					`    <ReleaseResourceReference ReleaseResourceType="${refType}">${escapeXml(release.resourceRefs[i])}</ReleaseResourceReference>`,
				);
			}
			lines.push(`  </ReleaseResourceReferenceList>`);
		}

		// ReleaseType
		lines.push(`  ${element('ReleaseType', release.type)}`);

		// ReleaseDetailsByTerritory
		lines.push(this.buildReleaseDetailsByTerritory(release, 2));

		// PLine
		if (release.pLine) {
			lines.push(this.buildCopyrightLine('PLine', release.pLine, 2));
		}

		// CLine
		if (release.cLine) {
			lines.push(this.buildCopyrightLine('CLine', release.cLine, 2));
		}

		lines.push('</Release>');
		return lines.join('\n');
	}

	private buildReleaseDetailsByTerritory(
		release: DDEXRelease,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [`${pad}<ReleaseDetailsByTerritory>`];

		// TerritoryCode
		const territories = release.territoryCodes || [
			release.applicableTerritoryCode || 'Worldwide',
		];
		for (const territory of territories) {
			lines.push(`${pad}  ${element('TerritoryCode', territory)}`);
		}

		// DisplayArtistName
		lines.push(
			`${pad}  ${element('DisplayArtistName', release.displayArtistName)}`,
		);

		// LabelName
		const labelName = release.labelName || release.labelRef;
		lines.push(`${pad}  ${element('LabelName', labelName)}`);

		// Titles (FormalTitle + DisplayTitle)
		lines.push(`${pad}  <Title TitleType="FormalTitle">`);
		lines.push(`${pad}    ${element('TitleText', release.title)}`);
		if (release.subTitle) {
			lines.push(`${pad}    ${element('SubTitle', release.subTitle)}`);
		}
		lines.push(`${pad}  </Title>`);
		lines.push(`${pad}  <Title TitleType="DisplayTitle">`);
		lines.push(`${pad}    ${element('TitleText', release.title)}`);
		if (release.subTitle) {
			lines.push(`${pad}    ${element('SubTitle', release.subTitle)}`);
		}
		lines.push(`${pad}  </Title>`);

		// DisplayArtists
		if (release.displayArtists) {
			for (const artist of release.displayArtists) {
				lines.push(this.buildDisplayArtist382(artist, indentLevel + 2));
			}
		}

		// ParentalWarningType
		lines.push(
			`${pad}  ${element('ParentalWarningType', release.parentalWarningType || 'NotExplicit')}`,
		);

		// ResourceGroup
		lines.push(this.buildResourceGroup382(release, indentLevel + 2));

		// Genre
		lines.push(`${pad}  <Genre>`);
		lines.push(`${pad}    ${element('GenreText', release.genre)}`);
		if (release.subGenre) {
			lines.push(`${pad}    ${element('SubGenre', release.subGenre)}`);
		}
		lines.push(`${pad}  </Genre>`);

		// OriginalReleaseDate
		lines.push(
			`${pad}  ${element('OriginalReleaseDate', release.releaseDate)}`,
		);

		lines.push(`${pad}</ReleaseDetailsByTerritory>`);
		return lines.join('\n');
	}

	private buildResourceGroup382(
		release: DDEXRelease,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [`${pad}<ResourceGroup>`];

		const isMainRelease =
			release.isMainRelease || release.reference === 'R0';

		// SequenceNumber only for main release ResourceGroup
		if (isMainRelease) {
			lines.push(`${pad}  ${element('SequenceNumber', '1')}`);
		}

		// ResourceGroupContentItem for sound recording resources

		// For simplicity, iterate over resource refs that are primary (sound recordings)
		const primaryRefs = release.resourceRefs.filter(
			(ref) => ref !== release.coverArtRef,
		);

		for (let i = 0; i < primaryRefs.length; i++) {
			const ref = primaryRefs[i];
			lines.push(`${pad}  <ResourceGroupContentItem>`);
			lines.push(
				`${pad}    ${element('SequenceNumber', (i + 1).toString())}`,
			);
			lines.push(
				`${pad}    ${element('ResourceType', 'SoundRecording')}`,
			);
			lines.push(
				`${pad}    <ReleaseResourceReference ReleaseResourceType="PrimaryResource">${escapeXml(ref)}</ReleaseResourceReference>`,
			);

			// LinkedReleaseResourceReference (e.g., lyrics)
			if (release.linkedResourceRefs) {
				for (const linked of release.linkedResourceRefs) {
					const linkDesc = linked.linkDescription
						? ` LinkDescription="${escapeXml(linked.linkDescription)}"`
						: '';
					lines.push(
						`${pad}    <LinkedReleaseResourceReference${linkDesc}>${escapeXml(linked.ref)}</LinkedReleaseResourceReference>`,
					);
				}
			}

			lines.push(`${pad}  </ResourceGroupContentItem>`);
		}

		lines.push(`${pad}</ResourceGroup>`);
		return lines.join('\n');
	}

	// ==================== Deal List ====================
	private buildDealList(deals: DDEXDeal[]): string {
		// Group deals by releaseRef
		const dealsByRelease = new Map<string, DDEXDeal[]>();
		for (const deal of deals) {
			const existing = dealsByRelease.get(deal.releaseRef) || [];
			existing.push(deal);
			dealsByRelease.set(deal.releaseRef, existing);
		}

		const dealElements: string[] = [];
		for (const [releaseRef, releaseDeals] of dealsByRelease) {
			dealElements.push(
				this.buildReleaseDeal382(releaseRef, releaseDeals),
			);
		}

		return `<DealList>\n${indent(dealElements.join('\n'), 2)}\n</DealList>`;
	}

	private buildReleaseDeal382(releaseRef: string, deals: DDEXDeal[]): string {
		const lines: string[] = [
			'<ReleaseDeal>',
			`  ${element('DealReleaseReference', releaseRef)}`,
		];

		for (const deal of deals) {
			lines.push(`  <Deal>`);
			lines.push(`    <DealTerms>`);

			// CommercialModelType (one per deal in 3.8.2)
			for (const model of deal.commercialModelTypes) {
				lines.push(`      ${element('CommercialModelType', model)}`);
			}

			// TakeDown
			if (deal.takeDown) {
				lines.push(`      ${element('TakeDown', 'true')}`);
			}

			// Usage > UseType
			if (deal.useTypes && deal.useTypes.length > 0) {
				lines.push(`      <Usage>`);
				for (const useType of deal.useTypes) {
					lines.push(`        ${element('UseType', useType)}`);
				}
				lines.push(`      </Usage>`);
			}

			// TerritoryCode
			for (const territory of deal.territories) {
				lines.push(`      ${element('TerritoryCode', territory)}`);
			}

			// ValidityPeriod
			lines.push(`      <ValidityPeriod>`);
			lines.push(
				`        ${element('StartDateTime', deal.validityStartDateTime)}`,
			);
			if (deal.validityEndDateTime) {
				lines.push(
					`        ${element('EndDateTime', deal.validityEndDateTime)}`,
				);
			}
			lines.push(`      </ValidityPeriod>`);

			lines.push(`    </DealTerms>`);
			lines.push(`  </Deal>`);
		}

		lines.push('</ReleaseDeal>');
		return lines.join('\n');
	}
}
