/**
 * Jest setup — set env vars bắt buộc cho unit test (chạy trước khi import module).
 * Một số service kéo chuỗi phụ thuộc yêu cầu env (vd util.encrypt cần CRYPTO_SECRET_KEY).
 * Giá trị dummy — test không mã hoá thật, chỉ cần biến tồn tại để import không throw.
 */
process.env.CRYPTO_SECRET_KEY =
	process.env.CRYPTO_SECRET_KEY ?? 'test-crypto-secret-key';
