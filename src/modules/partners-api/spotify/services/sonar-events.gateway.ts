import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface SonarScanEvent {
	scanId: string;
	type: 'progress' | 'completed' | 'failed';
	timestamp: string;
	data: {
		status: string;
		totalReleases: number;
		processedReleases: number;
		successCount: number;
		failedCount: number;
		errorMessage?: string;
	};
}

@Injectable()
export class SonarEventsGateway {
	private readonly stream$ = new Subject<SonarScanEvent>();

	emit(event: SonarScanEvent): void {
		this.stream$.next(event);
	}

	subscribe(scanId: string): Observable<SonarScanEvent> {
		return this.stream$
			.asObservable()
			.pipe(filter((evt) => evt.scanId === scanId));
	}
}
