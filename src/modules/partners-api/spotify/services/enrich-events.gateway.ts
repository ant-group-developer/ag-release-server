import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface EnrichEvent {
	scanId: string;
	type: 'progress' | 'completed' | 'failed' | 'cancelled';
	data: Record<string, any>;
	timestamp: string;
}

@Injectable()
export class EnrichEventsGateway {
	private readonly stream$ = new Subject<EnrichEvent>();

	emit(event: EnrichEvent): void {
		this.stream$.next(event);
	}

	subscribe(scanId: string): Observable<EnrichEvent> {
		return this.stream$.asObservable().pipe(
			filter((evt) => evt.scanId === scanId),
		);
	}
}
