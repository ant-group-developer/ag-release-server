export class CreateVideoDto {
    releaseId: string;
    isrc: string;
    explicit?: boolean;
    isAi?: boolean;
    channel: string;
    description?: string | null;
    isKids?: boolean;
    subtitles?: { language: string; fileId: string; fileName: string }[];
    contentProvider?: string | null;
    copyrightOwner?: string | null;
    partnerCustomId1?: string | null;
    partnerCustomId2?: string | null;
    fileId?: string | null;
}

import { PartialType } from '@nestjs/mapped-types';


export class UpdateVideoDto extends PartialType(CreateVideoDto) { }