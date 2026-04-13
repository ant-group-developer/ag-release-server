// src/modules/dsp-routing-configs/const/dsp-routing-config.const.ts
import { AppResponseSuccess } from 'src/app.const';
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { DspRoutingConfig } from '../entities/dsp-routing-config.entity';

export class DspRoutingConfigSuccess extends AppResponseSuccess {
	static COMMON<DspRoutingConfig>(data?: DspRoutingConfig) {
		return new ResponseSuccess({
			data,
			isRemoveSensitiveFields: true,
			sensitiveKeys: ['password', 'privateKey'],
		});
	}

	static CREATE(data?: DspRoutingConfig) {
		return new ResponseSuccess<DspRoutingConfig>({
			message: 'Create success',
			messageCode: 'dspRoutingConfig.message.success.create',
			data,
		});
	}

	static UPDATE(data?: DspRoutingConfig) {
		return new ResponseSuccess<DspRoutingConfig>({
			message: 'Update success',
			messageCode: 'dspRoutingConfig.message.success.update',
			data,
		});
	}

	static DELETE(data?: { id: string }) {
		return new ResponseSuccess<{ id: string }>({
			message: 'Delete success',
			messageCode: 'dspRoutingConfig.message.success.delete',
			data,
		});
	}
}

export class DspRoutingConfigException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Dsp routing config not found',
			messageCode: 'dspRoutingConfig.message.error.notFound',
		});
	}

	static AGGREGATOR_ID_REQUIRED() {
		return new ResponseError({
			statusCode: 400,
			message: 'aggregatorId is required when mode: AGGREGATOR',
			messageCode: 'dspRoutingConfig.message.error.aggregatorIdRequired',
		});
	}

	static AGGREGATOR_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Aggregator not found',
			messageCode: 'dspRoutingConfig.message.error.aggregatorNotFound',
		});
	}

	static SFTP_CONFIG_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Sftp config not found',
			messageCode: 'dspRoutingConfig.message.error.sftpConfigNotFound',
		});
	}

	static DSP_MISSING_DDEX_PARTY(code: string) {
		return new ResponseError({
			statusCode: 400,
			message: `DSP ${code} is missing DDEX Party configuration (ddexId or ddexName)`,
			messageCode: 'dspRoutingConfig.message.error.dspMissingDdexParty',
		});
	}

	static AGGREGATOR_MISSING_DDEX_PARTY(code: string) {
		return new ResponseError({
			statusCode: 400,
			message: `Aggregator for DSP ${code} is missing DDEX Party (ddexId or ddexName)`,
			messageCode:
				'dspRoutingConfig.message.error.aggregatorMissingDdexParty',
		});
	}

	static MISSING_APP_CONFIG_DDEX_PARTY() {
		return new ResponseError({
			statusCode: 500,
			message:
				'Missing DDEX_PARTY_ID_AMG or DDEX_PARTY_NAME_AMG in AppConfig',
			messageCode:
				'dspRoutingConfig.message.error.missingAppConfigDdexParty',
		});
	}

	static UNKNOWN_ROUTING_MODE(mode: string) {
		return new ResponseError({
			statusCode: 400,
			message: `Unknown routing mode: ${mode}`,
			messageCode: 'dspRoutingConfig.message.error.unknownRoutingMode',
		});
	}
}
