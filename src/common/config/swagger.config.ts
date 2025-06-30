import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import basicAuth from 'express-basic-auth';
dotenv.config();

export const setupSwagger = (app: INestApplication): void => {
	const SWAGGER_ROUTE = 'api-docs';

	const configService = app.get(ConfigService);

	const username = configService.get<string>('SWAGGER_USER') as string;
	const password = configService.get<string>('SWAGGER_PASSWORD') as string;

	app.use(
		[`/${SWAGGER_ROUTE}`],
		basicAuth({
			users: { [username]: password },
			challenge: true,
			unauthorizedResponse: 'Unauthorized - Bạn không có quyền truy cập',
		}),
	);

	const config = new DocumentBuilder()
		.setTitle('AG Music Distribution Server API')
		.setDescription(
			'API documentation for AG Music Distribution Server - A platform for music distribution and streaming',
		)
		.setVersion('1.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'Bearer',
				bearerFormat: 'JWT',
				in: 'header',
			},
			'token',
		)
		.addSecurityRequirements('token')
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup(SWAGGER_ROUTE, app, document, {
		swaggerOptions: { persistAuthorization: true },
	});

	// const postmanJson = convertSwaggerToPostman(document);

	// axios
	// 	.put(
	// 		`https://api.getpostman.com/collections/${process.env.POSTMAN_COLLECTION_UID}`,
	// 		{
	// 			collection: postmanJson,
	// 		},
	// 		{
	// 			headers: {
	// 				'x-api-key': process.env.POSTMAN_API_KEY,
	// 			},
	// 		},
	// 	)
	// 	.then((response) => {
	// 		console.log('Postman sync successful!', response.data);
	// 	})
	// 	.catch((err) => {
	// 		console.error(
	// 			'Error syncing with Postman:',
	// 			err.response?.data || err.message,
	// 		);
	// 	});
};

// function convertSwaggerToPostman(swaggerJson: any) {
// 	const items = Object.keys(swaggerJson.paths)
// 		.map((path) => {

// 			const pathData = swaggerJson.paths[path];
// 			const methods = Object.keys(pathData);

// 			// Determine module name (assuming it's based on the path)
// 			const moduleName = path.split('/')[1]; // This grabs the first part of the path as the module name (e.g., 'topic', 'user')

// 			return methods.map((method) => {
// 				return {
// 					name: path,
// 					request: {
// 						method: method.toUpperCase(),
// 						url: {
// 							raw: `https://api.example.com${path}`,
// 							host: ['api', 'example', 'com'],
// 							path: path.split('/').filter(Boolean),
// 						},
// 						body: {
// 							mode: 'raw',
// 							raw: JSON.stringify({}),
// 						},
// 					},
// 					response: [],
// 					// Grouping routes by module
// 					category: moduleName, // Adding category for module-based grouping
// 				};
// 			});
// 		})
// 		.flat();

// 	return {
// 		info: {
// 			name: 'ag-release-api',
// 			description: 'Collection exported from Swagger',
// 			schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
// 		},
// 		item: items,
// 	};
// }

function convertSwaggerToPostman(swaggerJson: any) {
	const items = Object.keys(swaggerJson.paths)
		.map((path) => {
			const pathData = swaggerJson.paths[path];
			const methods = Object.keys(pathData);

			// Lấy tên module từ path (ví dụ: 'user', 'auth', v.v.)
			const moduleName = path.split('/')[1]; // Lấy phần đầu tiên của đường dẫn (ví dụ: 'user', 'auth')

			return methods.map((method) => {
				return {
					name: path, // Tên endpoint
					request: {
						method: method.toUpperCase(),
						url: {
							raw: `https://api.example.com${path}`,
							host: ['api', 'example', 'com'],
							path: path.split('/').filter(Boolean),
						},
						body: {
							mode: 'raw',
							raw: JSON.stringify({}), // Thêm dữ liệu body nếu cần thiết
						},
					},
					response: [],
					// Nhóm các API vào thư mục theo moduleName
					folder: moduleName, // Sử dụng folder để nhóm API theo module
				};
			});
		})
		.flat();

	return {
		info: {
			name: 'ag-release-api',
			description: 'Collection exported from Swagger',
			schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
		},
		item: items,
	};
}
