'use strict';

const DEFAULT_BASE_URL = 'https://pg.vltcx.eu.cc/api';

/**
 * @typedef {object} PaymentData
 * @property {number} transactionId
 * @property {string} referenceId
 * @property {number} amount
 * @property {number} amountRequested
 * @property {string} qrisUrl
 * @property {string} qrisString
 * @property {number} expiresAt
 * @property {string} expiresAtHuman
 * @property {string} status
 */

/**
 * @typedef {object} PaymentResult
 * @property {string}  status
 * @property {boolean} paid
 * @property {boolean} expired
 * @property {string|null} paidAt
 * @property {string|null} payerBrand
 * @property {string|null} payerInfo
 * @property {boolean} webhookSent
 * @property {object}  raw
 */

/**
 * @typedef {object} CreateOptions
 * @property {number}  amount
 * @property {string}  [referenceId]
 * @property {string}  [description]
 * @property {number}  [expireMinutes=60]
 */

/**
 * @typedef {object} PollOptions
 * @property {number}   [intervalMs=5000]
 * @property {number}   [timeoutMs=300000]
 * @property {function} [onPoll]  (attempt: number, status: string) => void
 */

class VioleticsPayment {
  /**
   * @param {string} apiKey   - Violetics API Key (format: vlt_xxx)
   * @param {string} [baseUrl]
   */
  constructor(apiKey, baseUrl = DEFAULT_BASE_URL) {
    if (!apiKey) throw new Error('apiKey is required');
    this._apiKey  = apiKey;
    this._baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ── Internal ────────────────────────────────────────────────────────────

  async _get(action, params = {}) {
    const qs = new URLSearchParams({ apikey: this._apiKey, action, ...params });
    const res = await fetch(`${this._baseUrl}?${qs}`);
    const data = await res.json();
    if (!data.status && !data.success)
      throw new VioleticsError(data.message ?? `HTTP ${res.status}`, res.status, data);
    return data;
  }

  async _post(action, body = {}) {
    const url = `${this._baseUrl}?apikey=${encodeURIComponent(this._apiKey)}&action=${action}`;
    const res = await fetch(url, {
      method: 'POST',
      body:   new URLSearchParams(body),
    });
    const data = await res.json();
    if (!data.status && !data.success)
      throw new VioleticsError(data.message ?? `HTTP ${res.status}`, res.status, data);
    return data;
  }

  // ── Payment ─────────────────────────────────────────────────────────────

  /**
   * Buat order pembayaran baru.
   * @param {CreateOptions} opts
   * @returns {Promise<PaymentData>}
   */
  async create({ amount, referenceId, description, expireMinutes = 60 } = {}) {
    if (!amount || amount <= 0) throw new Error('amount harus lebih dari 0');

    const params = { amount, expire_minutes: expireMinutes };
    if (referenceId) params.reference_id = referenceId;
    if (description) params.description  = description;

    const { data: d } = await this._get('create_payment', params);
    return {
      transactionId:   d.transaction_id,
      referenceId:     d.reference_id,
      amount:          d.amount,
      amountRequested: d.amount_requested,
      qrisUrl:         d.qris_url,
      qrisString:      d.qris_string,
      expiresAt:       d.expires_at,
      expiresAtHuman:  d.expires_at_human,
      status:          d.status,
    };
  }

  /**
   * Cek status pembayaran satu kali.
   * @param {string} referenceId
   * @returns {Promise<PaymentResult>}
   */
  async check(referenceId) {
    if (!referenceId) throw new Error('referenceId is required');
    const { data: d } = await this._get('check_payment', { reference_id: referenceId });
    return {
      status:      d.status,
      paid:        d.status === 'paid',
      expired:     d.status === 'expired',
      paidAt:      d.paid_at      ?? null,
      payerBrand:  d.payer_brand  ?? null,
      payerInfo:   d.payer_info   ?? null,
      webhookSent: Boolean(d.webhook_sent),
      raw:         d,
    };
  }

  /**
   * Poll pembayaran sampai paid/expired atau timeout.
   * @param {string}      referenceId
   * @param {PollOptions} [opts]
   * @returns {Promise<PaymentResult>}
   */
  async poll(referenceId, { intervalMs = 5000, timeoutMs = 300_000, onPoll } = {}) {
    if (!referenceId) throw new Error('referenceId is required');

    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;
      const result = await this.check(referenceId);

      if (typeof onPoll === 'function') onPoll(attempt, result.status);
      if (result.paid || result.expired) return result;

      const wait = Math.min(intervalMs, deadline - Date.now());
      if (wait <= 0) break;
      await new Promise(r => setTimeout(r, wait));
    }

    throw new VioleticsTimeoutError(
      `Polling timeout setelah ${timeoutMs / 1000}s`,
      referenceId,
      timeoutMs,
    );
  }

  /**
   * Shortcut: buat order + poll sampai selesai.
   * @param {CreateOptions}  paymentOpts
   * @param {PollOptions}    [pollOpts]
   * @returns {Promise<{payment: PaymentData, result: PaymentResult}>}
   */
  async createAndWait(paymentOpts, pollOpts = {}) {
    const payment = await this.create(paymentOpts);
    const result  = await this.poll(payment.referenceId, pollOpts);
    return { payment, result };
  }

  /**
   * Ambil daftar transaksi.
   * @param {{limit?: number, offset?: number}} [opts]
   */
  async list({ limit = 20, offset = 0 } = {}) {
    const res = await this._get('list_payments', { limit, offset });
    return res.data;
  }

  // ── Orderkuota auth ──────────────────────────────────────────────────────

  /** Login Orderkuota langkah 1 — kirim OTP ke email. */
  async requestOtp(username, password) {
    return this._post('request_otp', { username, password });
  }

  /** Login Orderkuota langkah 2 — verifikasi OTP. */
  async verifyOtp(otp) {
    return this._post('verify_otp', { otp });
  }

  // ── Account ──────────────────────────────────────────────────────────────

  /** Set webhook URL. Returns { webhookUrl, webhookSecret }. */
  async setWebhook(webhookUrl) {
    const res = await this._post('set_webhook', { webhook_url: webhookUrl });
    return {
      webhookUrl:    res.data.webhook_url,
      webhookSecret: res.data.webhook_secret,
    };
  }

  /** Regenerate API Key. Key lama langsung tidak berlaku. */
  async regenerateKey() {
    const res = await this._post('regenerate_key', {});
    return res.data.new_api_key;
  }

  // ── Static helpers ───────────────────────────────────────────────────────

  /**
   * Verifikasi HMAC-SHA256 webhook signature.
   * @param {Buffer|string} rawBody    - Raw request body
   * @param {string}        signature  - X-Violetics-Signature header value
   * @param {string}        secret     - Webhook secret dari setWebhook()
   * @returns {boolean}
   */
  static verifyWebhook(rawBody, signature, secret) {
    // Node.js
    if (typeof require !== 'undefined') {
      const { createHmac, timingSafeEqual } = require('crypto');
      const expected = createHmac('sha256', secret)
        .update(typeof rawBody === 'string' ? rawBody : rawBody)
        .digest('hex');
      try {
        return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      } catch {
        return false;
      }
    }
    // Browser (Web Crypto — async, use verifyWebhookAsync instead)
    throw new Error('Use VioleticsPayment.verifyWebhookAsync() in browser environments');
  }

  /**
   * Verifikasi webhook signature (async, browser-compatible).
   */
  static async verifyWebhookAsync(rawBody, signature, secret) {
    const enc  = new TextEncoder();
    const key  = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key,
      typeof rawBody === 'string' ? enc.encode(rawBody) : rawBody,
    );
    const expected = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return expected === signature;
  }
}

// ── Custom errors ─────────────────────────────────────────────────────────

class VioleticsError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name       = 'VioleticsError';
    this.statusCode = statusCode;
    this.response   = response;
  }
}

class VioleticsTimeoutError extends Error {
  constructor(message, referenceId, timeoutMs) {
    super(message);
    this.name        = 'VioleticsTimeoutError';
    this.referenceId = referenceId;
    this.timeoutMs   = timeoutMs;
  }
}

module.exports = { VioleticsPayment, VioleticsError, VioleticsTimeoutError };
module.exports.default = VioleticsPayment;
