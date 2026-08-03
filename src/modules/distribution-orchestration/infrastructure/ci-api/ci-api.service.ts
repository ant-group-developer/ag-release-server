import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { CI_API_CONFIG, CiApiConfig } from './ci-api.config';

/**
 * CiApiService — Base HTTP client for CI API.
 *
 * Provides authenticated axios instance with timeout config.
 * All CI API services inherit from this base.
 *
 * Features:
 * - Bearer token authentication
 * - 30s timeout (configurable)
 * - Error logging
 * - Organisation ID injection
 */
@Injectable()
export class CiApiService {
	protected readonly logger = new Logger(CiApiService.name);
	private readonly axiosInstance: AxiosInstance;

	constructor(@Inject(CI_API_CONFIG) protected readonly config: CiApiConfig) {
		const timeout = config.timeout ?? 30000;

		this.axiosInstance = axios.create({
			timeout,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		// Inject baseURL + token lazily (config uses getters → reads from AppConfigService at call time)
		this.axiosInstance.interceptors.request.use((req) => {
			req.baseURL = config.baseUrl;
			req.headers.Authorization = `Bearer ${config.token}`;
			return req;
		});
	}

	/**
	 * GET request with error handling.
	 */
	protected async get<T>(
		endpoint: string,
		params?: Record<string, any>,
	): Promise<T> {
		try {
			const response = await this.axiosInstance.get<T>(endpoint, {
				params,
			});
			return response.data;
		} catch (error) {
			this.handleError(error, 'GET', endpoint);
			throw error;
		}
	}

	/**
	 * POST request with error handling.
	 */
	protected async post<T>(endpoint: string, data?: any): Promise<T> {
		try {
			const response = await this.axiosInstance.post<T>(endpoint, data);
			return response.data;
		} catch (error) {
			this.handleError(error, 'POST', endpoint);
			throw error;
		}
	}

	/**
	 * Centralized error logging.
	 */
	private handleError(
		error: unknown,
		method: string,
		endpoint: string,
	): void {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			this.logger.error(
				`${method} ${endpoint} failed: ${axiosError.response?.status || 'NETWORK_ERROR'} - ${axiosError.message}`,
			);
		} else {
			this.logger.error(`${method} ${endpoint} failed: ${String(error)}`);
		}
	}

	protected get orgId(): string {
		return this.config.organisationId;
	}
}
