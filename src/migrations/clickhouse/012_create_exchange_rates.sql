-- ============================================================================
-- Migration 012: Create exchange_rates
-- Purpose: Bảng chứa tỷ giá EOM (End-of-Month) quy đổi ngoại tệ sang USD
--          Dữ liệu từ Frankfurter API v2: https://api.frankfurter.dev/v2/rates
-- Flow:    ExchangeRateService fetch API → INSERT vào bảng này
--          MV cubes v2 JOIN bảng này để convert revenue sang USD khi data vào cube
-- ============================================================================

CREATE TABLE IF NOT EXISTS music_analytics.exchange_rates (
    rate_month       String                  COMMENT 'Định dạng YYYY-MM, ví dụ: 2024-01',
    currency         LowCardinality(String)  COMMENT 'Mã tiền tệ ISO (EUR, GBP, VND, JPY...)',
    rate             Float64                 COMMENT 'Tỷ giá: 1 USD = X ngoại tệ',
    rate_date        Date                    COMMENT 'Ngày chốt tỷ giá (ngày cuối tháng hoặc ngày gần nhất)',
    is_provisional   UInt8 DEFAULT 0         COMMENT '1 = tỷ giá tạm tính, 0 = EOM chính thức',
    updated_at       DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (rate_month, currency)
COMMENT 'Tỷ giá quy đổi ngoại tệ EOM từ Frankfurter API. 1 USD = X ngoại tệ.';
