import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface JobEvent {
  jobId: string;
  type: 'progress' | 'completed' | 'failed' | 'snapshot';
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
    return this.stream$.asObservable().pipe(
      filter((evt) => evt.jobId === jobId),
    );
  }
}
