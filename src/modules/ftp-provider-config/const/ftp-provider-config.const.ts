// src/modules/ftp-provider-config/const/ftp-provider-config.const.ts
import { FieldOrderCommon } from 'src/common/constants/common.class';
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { FtpProviderConfig } from '../entities/ftp-provider-config.entity';

export class FtpProviderConfigSuccess {
	static COMMON<FtpProviderConfig>(data?: FtpProviderConfig) {
		return new ResponseSuccess({
			data,
			isRemoveSensitiveFields: true,
			sensitiveKeys: ['password', 'passwordEncrypted'],
		});
	}

	static CREATE(data?: FtpProviderConfig) {
		return new ResponseSuccess<FtpProviderConfig>({
			message: 'Create success',
			messageCode: 'ftpProviderConfig.message.success.create',
			data,
			isRemoveSensitiveFields: true,
			sensitiveKeys: ['password', 'passwordEncrypted'],
		});
	}

	static UPDATE(data?: FtpProviderConfig) {
		return new ResponseSuccess<FtpProviderConfig>({
			message: 'Update success',
			messageCode: 'ftpProviderConfig.message.success.update',
			data,
			isRemoveSensitiveFields: true,
			sensitiveKeys: ['password', 'passwordEncrypted'],
		});
	}

	static DELETE(data?: any) {
		return new ResponseSuccess<any>({
			message: 'Delete success',
			messageCode: 'ftpProviderConfig.message.success.delete',
			data,
		});
	}
}

export class FtpProviderConfigException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Ftp provider config not found',
			messageCode: 'ftpProviderConfig.message.error.notFound',
		});
	}

	static CODE_EXISTS() {
		return new ResponseError({
			message: 'Ftp provider config code already exists',
			messageCode: 'ftpProviderConfig.message.error.codeExists',
		});
	}

	static NO_ACTIVE_CONFIG() {
		return new ResponseError({
			statusCode: 404,
			message:
				'No active FTP provider config. Configure one via POST /admin/ftp-provider-configs',
			messageCode: 'ftpProviderConfig.message.error.noActiveConfig',
		});
	}

	static CANNOT_DELETE_ACTIVE() {
		return new ResponseError({
			message:
				'Cannot delete an active FTP provider config. Activate another config first',
			messageCode: 'ftpProviderConfig.message.error.cannotDeleteActive',
		});
	}
}

export class FieldOrderFtpProviderConfig extends FieldOrderCommon {
	protected static mainAlias = OrmAlias.ftpProviderConfig;
}
