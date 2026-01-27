// src/modules/sftp-configs/const/sftp-config.const.ts
import { FieldOrderCommon } from 'src/common/constants/common.class';
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { SftpConfig } from '../entities/sftp-config.entity';

export class SftpConfigSuccess {
	static CREATE(data?: SftpConfig) {
		return new ResponseSuccess<SftpConfig>({
			message: 'Create success',
			messageCode: 'sftpConfig.message.success.create',
			data,
		});
	}

	static UPDATE(data?: SftpConfig) {
		return new ResponseSuccess<SftpConfig>({
			message: 'Update success',
			messageCode: 'sftpConfig.message.success.update',
			data,
		});
	}

	static DELETE(data?: { id: string }) {
		return new ResponseSuccess<{ id: string }>({
			message: 'Delete success',
			messageCode: 'sftpConfig.message.success.delete',
			data,
		});
	}
}

export class SftpConfigException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Sftp config not found',
			messageCode: 'sftpConfig.message.error.notFound',
		});
	}

	static AGGREGATOR_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Aggregator not found',
			messageCode: 'sftpConfig.message.error.aggregatorNotFound',
		});
	}

	static AGGREGATOR_HAS_CONFIG() {
		return new ResponseError({
			message: 'Aggregator already has sftp config',
			messageCode: 'sftpConfig.message.error.aggregatorHasConfig',
		});
	}
}

export class FieldOrderSftpConfig extends FieldOrderCommon {
	protected static mainAlias = OrmAlias.sftpConfig;
}
