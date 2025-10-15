import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './common/config/env.validation.schema';
import { ActionModule } from './modules/action/action.module';
import { AlbumFormatModule } from './modules/album-format/album-format.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { ArtistProfileModule } from './modules/artist-profile/artist-profile.module';
import { ArtistRoleModule } from './modules/artist-role/artist-role.module';
import { ArtistModule } from './modules/artist/artist.module';
import { AudioFileModule } from './modules/audio-file/audio-file.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PolicyGuard } from './modules/auth/guards/policy.guard';
import { BucketModule } from './modules/bucket/bucket.module';
import { CacheModule } from './modules/cache/cache.module';
import { CopyrightModule } from './modules/copyright/copyright.module';
import { CountryModule } from './modules/country/country.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { DatabaseModule } from './modules/database/database.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DspActionModule } from './modules/dsp-action/dsp-action.module';
import { DspModule } from './modules/dsp/dsp.module';
import { GenreModule } from './modules/genre/genre.module';
import { IssueLevelModule } from './modules/issue-level/issue-level.module';
import { IssueModule } from './modules/issue/issue.module';
import { LabelModule } from './modules/label/label.module';
import { LanguageModule } from './modules/language/language.module';
import { NewsCategoryModule } from './modules/news-category/news-category.module';
import { NewsPostModule } from './modules/news-post/news-post.module';
import { PermissionModule } from './modules/permission/permission.module';
import { PriceTierModule } from './modules/price-tiers/price-tier.module';
import { ReleaseArtistModule } from './modules/release-artist/release-artist.module';
import { ReleaseDspModule } from './modules/release-dsp/release-dsp.module';
import { ReleaseLocalizeModule } from './modules/release-localize/release-localize.module';
import { ReleaseModule } from './modules/release/release.module';
import { RoleModule } from './modules/role/role.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { TenantDspModule } from './modules/tenant-dsp/tenant-dsp.module';
import { TenantIssueModule } from './modules/tenant-issue/tenant-issue.module';
import { TenantTierModule } from './modules/tenant-tiers/tenant-tiers.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TimezoneModule } from './modules/timezone/timezone.module';
import { TokenModule } from './modules/token/token.module';
import { TrackArtistModule } from './modules/track-artist/track-artist.module';
import { TrackLanguageModule } from './modules/track-language/track-language.module';
import { TrackLocalizeModule } from './modules/track-localize/track-localize.module';
import { TrackOriginTypeModule } from './modules/track-origin-type/track-origin-type.module';
import { TrackRevenueModule } from './modules/track-revenue/track-revenue.module';
import { TrackSensitiveModule } from './modules/track-sensitive/track-sensitive.module';
import { TrackTypeModule } from './modules/track-type/track-type.module';
import { TrackModule } from './modules/track/track.module';
import { UserRoleModule } from './modules/user-role/user-role.module';
import { UserModule } from './modules/user/user.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validationSchema: envValidationSchema,
		}),
		// TypeOrmModule.forRootAsync({
		// 	imports: [ConfigModule],
		// 	useClass: DatabaseConfigService,
		// }),

		CacheModule,

		EventEmitterModule.forRoot(),

		DatabaseModule,
		// ... other modules

		CountryModule,
		LanguageModule,

		DspModule,
		GenreModule,
		JwtModule,
		LabelModule,

		PermissionModule,

		ReleaseModule,
		AlbumFormatModule,
		ReleaseArtistModule,
		// ReleaseLanguageModule,
		// ReleaseCoverArtModule,
		ReleaseLocalizeModule,
		ReleaseDspModule,

		TrackModule,
		TrackArtistModule,
		TrackLanguageModule,
		TrackLocalizeModule,
		CopyrightModule,
		AudioFileModule,
		TrackTypeModule,
		TrackOriginTypeModule,

		ArtistModule,
		ArtistRoleModule,
		ArtistProfileModule,

		BucketModule,
		TimezoneModule,

		AppConfigModule,
		TenantModule,
		TenantDspModule,
		UserModule,
		AuthModule,
		TokenModule,

		UserRoleModule,
		PermissionModule,
		RoleModule,

		ActionModule,
		DspActionModule,

		CurrencyModule,
		PriceTierModule,

		ScheduleModule,
		TrackRevenueModule,
		TrackSensitiveModule,

		IssueModule,
		IssueLevelModule,
		TenantIssueModule,
		TenantTierModule,
		StatisticsModule,

		NewsCategoryModule,
		NewsPostModule,

		DeliveryModule,
	],
	controllers: [AppController],
	providers: [
		{ provide: APP_GUARD, useClass: JwtAuthGuard }, // 1) require JWT by default, skip @Public
		{ provide: APP_GUARD, useClass: PolicyGuard }, // 2) permissions + tenant-owner
		AppService,
	],
})
export class AppModule {}
