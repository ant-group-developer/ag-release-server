import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface JobEvent {
	jobId: string;
	type: 'progress' | 'completed' | 'failed' | 'cancelled' | 'snapshot';
	data: Record<string, any>;
	timestamp: string;
}

@Injectable()
export class JobEventsGateway {
	private readonly stream$ = new Subject<JobEvent>();

	emit(event: JobEvent): void {
		this.stream$.next(event);
	}

	subscribe(jobId: string): Observable<JobEvent> {
		return this.stream$
			.asObservable()
			.pipe(filter((evt) => evt.jobId === jobId));
	}
}
