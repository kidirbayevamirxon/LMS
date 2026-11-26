import crypto from 'crypto';
import { env } from '../../config/env.js';

export interface CheckoutInitResult {
  provider: 'CLICK' | 'PAYME';
  checkoutUrl: string;
  configured: boolean;
}

export function buildClickCheckoutUrl(params: {
  paymentMonthId: string;
  amount: number;
  returnUrl?: string;
}): CheckoutInitResult {
  const configured = Boolean(env.CLICK_MERCHANT_ID && env.CLICK_SERVICE_ID);
  const url = new URL('https://my.click.uz/services/pay');
  url.searchParams.set('service_id', env.CLICK_SERVICE_ID || 'demo_service');
  url.searchParams.set('merchant_id', env.CLICK_MERCHANT_ID || 'demo_merchant');
  url.searchParams.set('amount', params.amount.toFixed(2));
  url.searchParams.set('transaction_param', params.paymentMonthId);
  if (params.returnUrl) url.searchParams.set('return_url', params.returnUrl);

  return {
    provider: 'CLICK',
    checkoutUrl: url.toString(),
    configured,
  };
}

export function verifyClickSignature(payload: {
  click_trans_id: string;
  service_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  sign_time: string;
  sign_string: string;
}): boolean {
  if (!env.CLICK_SECRET_KEY) return false;
  const raw = `${payload.click_trans_id}${payload.service_id}${env.CLICK_SECRET_KEY}${payload.merchant_trans_id}${
    payload.merchant_prepare_id ?? ''
  }${payload.amount}${payload.action}${payload.sign_time}`;
  const expected = crypto.createHash('md5').update(raw).digest('hex');
  return expected === payload.sign_string;
}

export function buildPaymeCheckoutUrl(params: {
  paymentMonthId: string;
  amount: number;
}): CheckoutInitResult {
  const configured = Boolean(env.PAYME_MERCHANT_ID);
  const tiyin = Math.round(params.amount * 100);
  const rawParam = `m=${env.PAYME_MERCHANT_ID || 'demo_merchant'};ac.order_id=${params.paymentMonthId};a=${tiyin}`;
  const encoded = Buffer.from(rawParam, 'utf8').toString('base64');
  return {
    provider: 'PAYME',
    checkoutUrl: `https://checkout.paycom.uz/${encoded}`,
    configured,
  };
}

export function verifyPaymeBasicAuth(authHeader?: string): boolean {
  if (!env.PAYME_SECRET_KEY || !authHeader?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const [, secret] = decoded.split(':');
  return secret === env.PAYME_SECRET_KEY;
}
