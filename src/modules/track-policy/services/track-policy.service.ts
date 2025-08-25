import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ResponseError } from 'src/common/dtos/response.dto';
import { Action } from 'src/modules/action/entities/action.entity';
import { UpdateTrackPolicyDto } from 'src/modules/track/dto/track.draft.dto';
import { TrackPolicy } from '../entities/track-policy.entity';
import { TrackPolicyDspService } from './track-policy.dsp-service';

@Injectable()
export class TrackPolicyService {
	constructor(
		@InjectRepository(TrackPolicy)
		private readonly trackPolicyRepo: Repository<TrackPolicy>,

		private readonly trackPolicyDspService: TrackPolicyDspService,

		@InjectRepository(Action)
		private readonly actionRepo: Repository<Action>,
	) {}

	async createTrackPoliciesForMultipleTracks(trackIds: string[]) {
		const listDspWithDefaultAction =
			await this.trackPolicyDspService.getListWithDefaultActions();

		const trackPolicies = trackIds
			.map((trackId) =>
				listDspWithDefaultAction.map((item) =>
					this.trackPolicyRepo.create({
						...item,
						trackId,
					}),
				),
			)
			.flat();

		return this.trackPolicyRepo.save(trackPolicies);
	}

	async createTrackPoliciesOfTrack({ trackId }: { trackId: string }) {
		const listEntities = await this.createListEntities({ trackId });
		return await this.trackPolicyRepo.save(listEntities);
	}

	private async createListEntities({ trackId }: { trackId: string }) {
		const listDspWithDefaultAction =
			await this.trackPolicyDspService.getListWithDefaultActions();

		return listDspWithDefaultAction.map((item) => {
			return this.trackPolicyRepo.create({
				...item,
				trackId,
			});
		});
	}

	// read
	async findOne(id: string) {
		const trackPolicy = await this.trackPolicyRepo.findOne({
			where: { id },
		});

		if (!trackPolicy) {
			throw new ResponseError({ message: 'Track policy not found' });
		}

		return trackPolicy;
	}

	async getListOfTrack({ trackId }: { trackId: string }) {
		return await this.trackPolicyRepo.find({ where: { trackId } });
	}

	async update({
		trackPolicyId,
		data,
	}: {
		trackPolicyId: string;
		data: UpdateTrackPolicyDto;
	}) {
		const { actionId } = data;

		const entity = await this.findOne(trackPolicyId);
		if (actionId && actionId !== entity.actionId) {
			const action = await this.actionRepo.findOne({
				where: { id: actionId },
			});

			if (!action) {
				throw new ResponseError({
					message: 'Action not found',
				});
			}

			entity.actionId = actionId;
		}

		return this.trackPolicyRepo.save(entity);
	}

	async deleteRecordOrTrack({ trackId }: { trackId: string }) {
		await this.trackPolicyRepo.delete({ trackId });
	}
}
