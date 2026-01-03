import { Entity } from 'typeorm';

@Entity('parse_release_history')
export class ParseReleaseHistory {
	releaseId: string;
	time: string; // tong thoi gian
	note: string; // thoong tin exception, cac truong map
	createdAt: Date;
}

export class PushToCiHistory {}
