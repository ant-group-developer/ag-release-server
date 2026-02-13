import { Observable } from 'rxjs';

export interface GenerateIsrcRequest {
	quantity: number;
}

export interface GenerateIsrcResponse {
	codes: string[];
}

export interface IsrcGrpcService {
	generateIsrc(data: GenerateIsrcRequest): Observable<GenerateIsrcResponse>;
}
