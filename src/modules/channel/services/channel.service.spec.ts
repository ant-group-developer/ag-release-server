import { ResponseError } from 'src/common/dtos/common.response.dto';
import { ChannelService } from './channel.service';

describe('ChannelService.update tenant change', () => {
	it('rejects PUT tenant changes and points to the transfer endpoint', async () => {
		const service = Object.create(
			ChannelService.prototype,
		) as ChannelService;
		const findOne = jest.fn().mockResolvedValue({
			id: 'ch-1',
			tenantId: 'tenant-a',
			name: 'WandeCoalVEVO',
		});
		(service as unknown as { findOne: typeof findOne }).findOne = findOne;

		await expect(
			service.update(
				'ch-1',
				{ tenantId: 'tenant-b' },
				'tenant-a',
				'user-1',
			),
		).rejects.toBeInstanceOf(ResponseError);

		await service
			.update('ch-1', { tenantId: 'tenant-b' }, 'tenant-a', 'user-1')
			.catch((error: ResponseError) => {
				expect(error.getResponse()).toMatchObject({
					messageCode: 'channel.transfer.useTransferEndpoint',
				});
			});
	});
});
