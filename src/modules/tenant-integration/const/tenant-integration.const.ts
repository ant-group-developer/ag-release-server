// tenant-integration.constant.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class TenantIntegrationSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'tenantIntegration.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'tenantIntegration.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'tenantIntegration.message.success.delete',
		});
	}
}

export class TenantIntegrationException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Tenant integration not found',
			messageCode: 'tenantIntegration.message.error.notFound',
		});
	}

	static DSP_ALREADY_ENABLED() {
		return new ResponseError({
			message: 'DSP already enabled for tenant',
			messageCode: 'tenantIntegration.message.error.dspExisted',
		});
	}
}
