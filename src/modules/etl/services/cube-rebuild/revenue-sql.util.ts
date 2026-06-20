export const DECIMAL_ONE = 'toDecimal128(1, 18)';

export const EXCHANGE_RATE_DECIMAL = `
if(
  toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, ${DECIMAL_ONE}) > 0,
  toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, ${DECIMAL_ONE}),
  ${DECIMAL_ONE}
)`;

export const REVENUE_USD_EXPRESSION = `
sum(
  if(
    f.revenue_usd != 0,
    f.revenue_usd,
    divideDecimal(f.revenue_local, ${EXCHANGE_RATE_DECIMAL}, 18)
  )
)`;
