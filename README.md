# vxgate

Violetics Payment Gateway SDK — terima pembayaran QRIS via Orderkuota dengan sedikit baris kode.

[![npm](https://img.shields.io/npm/v/vxgate)](https://www.npmjs.com/package/vxgate)
[![license](https://img.shields.io/npm/l/vxgate)](LICENSE)

## Get API Key

1. Daftar di **[pg.vltcx.eu.cc/register](https://pg.vltcx.eu.cc/register)**
2. Verifikasi akun via email
3. Buka **Dashboard → API Key**
4. Copy key format `vlt_xxx`

## Install

```bash
npm install vxgate
```

## Quick Start

```js
import { VXGatePayment } from 'vxgate';

const pay = new VXGatePayment('vlt_YOUR_API_KEY');

// Buat order + poll sampai lunas
const { payment, result } = await pay.createAndWait({
  amount:        15000,
  referenceId:   `ORDER-${Date.now()}`,
  description:   'Pembelian Premium',
  expireMinutes: 30,
});

if (result.paid) {
  console.log(`Lunas via ${result.payerBrand}`);
  console.log(`QR URL: ${payment.qrisUrl}`);
}
```

---

## API Reference

### `new VXGatePayment(apiKey, [baseUrl])`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | `string` | — | API Key (format `vlt_xxx`) |
| `baseUrl` | `string` | `https://pg.vltcx.eu.cc/api` | Custom base URL |

---

### `.create(opts)` → `Promise<PaymentData>`

Buat order pembayaran baru. Sistem auto-generate nominal unik (+1–500) untuk matching mutasi.

```js
const payment = await pay.create({
  amount:        15000,        // wajib
  referenceId:   'ORDER-001', // opsional, auto-generate jika kosong
  description:   'Premium',  // opsional
  expireMinutes: 15,          // opsional, default 15
  webhook:       'https://yourapp.com/cb', // opsional, per-transaksi
});
```

**Response `PaymentData`:**

```json
{
  "transactionId":  17,
  "referenceId":    "ORDER-001",
  "amount":         15001,
  "amountRequested": 15000,
  "amountSuffix":   1,
  "qrisUrl":        "https://yourdomain.com/qr.php?ref=ORDER-001&id=17",
  "qrisString":     "00020101021226...",
  "expiresAt":      1749123456,
  "expiresAtHuman": "2026-06-05 15:00:00",
  "webhook":        "https://yourapp.com/cb",
  "status":         "pending"
}
```

> `qrisUrl` returns `image/png` langsung — pakai sebagai `<img src="...">`.
> `amount` bisa berbeda dari `amountRequested` karena suffix unik.

---

### `.check(referenceId)` → `Promise<PaymentResult>`

Cek status sekali. Jika `pending`, sistem otomatis match dengan mutasi terbaru dari Orderkuota — jika cocok, status berubah `paid` dan webhook di-fire.

```js
const result = await pay.check('ORDER-001');
```

**Response `PaymentResult`:**

```json
{
  "status":      "paid",
  "paid":        true,
  "expired":     false,
  "paidAt":      "2026-06-05 14:42:17",
  "payerBrand":  "OVO",
  "payerInfo":   "Pembayaran QRIS",
  "webhookSent": true,
  "raw": {
    "transaction_id": 17,
    "reference_id":   "ORDER-001",
    "amount":         15001,
    "description":    "Premium",
    "status":         "paid",
    "qris_url":       "https://yourdomain.com/qr.php?ref=ORDER-001&id=17",
    "payer_brand":    "OVO",
    "payer_info":     "Pembayaran QRIS",
    "created_at":     "2026-06-05 14:40:00",
    "expires_at":     1749123456,
    "paid_at":        "2026-06-05 14:42:17",
    "webhook_sent":   true
  }
}
```

---

### `.poll(referenceId, [opts])` → `Promise<PaymentResult>`

Poll sampai `paid`/`expired` atau timeout. Throws `VXGateTimeoutError` jika waktu habis.

```js
const result = await pay.poll('ORDER-001', {
  intervalMs: 3000,      // cek tiap 3 detik (default: 5000)
  timeoutMs:  600_000,   // timeout 10 menit (default: 300000)
  onPoll: (n, status) => console.log(`[#${n}] ${status}`),
});
```

---

### `.createAndWait(paymentOpts, [pollOpts])` → `Promise<{payment, result}>`

Shortcut buat + poll. `payment` tersedia segera, polling berjalan di background.

```js
const { payment, result } = await pay.createAndWait(
  { amount: 15000, referenceId: 'ORDER-001' },
  { intervalMs: 3000, timeoutMs: 300_000 }
);

console.log(payment.qrisUrl);    // tampilkan ke customer
console.log(result.paid);        // true jika lunas
console.log(result.payerBrand);  // 'GOPAY' | 'OVO' | 'DANA' | ...
```

> Kalau perlu tampilkan QR **dulu** sebelum menunggu, gunakan `.create()` + `.poll()` terpisah:
> ```js
> const payment = await pay.create({ amount: 15000 });
> tampilkanQR(payment.qrisUrl);
> const result = await pay.poll(payment.referenceId);
> if (result.paid) console.log('Lunas!');
> ```

---

### `.list([opts])` → `Promise<Transaction[]>`

Daftar transaksi (maks 50).

```js
const txs = await pay.list({ limit: 20, offset: 0 });
```

**Response item:**

```json
{
  "transaction_id": 17,
  "reference_id":   "ORDER-001",
  "amount":         15001,
  "description":    "Premium",
  "status":         "paid",
  "payer_brand":    "OVO",
  "created_at":     "2026-06-05 14:40:00",
  "paid_at":        "2026-06-05 14:42:17",
  "expires_at":     1749123456
}
```

---

### `.setWebhook(url)` → `Promise<{webhookUrl, webhookSecret}>`

Set global webhook URL. Semua transaksi yang paid akan POST ke URL ini.

```js
const { webhookSecret } = await pay.setWebhook('https://yourapp.com/webhook');
// Simpan webhookSecret untuk verifikasi signature
```

**Webhook payload (POST body JSON):**

```json
{
  "event":        "payment.success",
  "reference_id": "ORDER-001",
  "amount":       15001,
  "payer_brand":  "OVO",
  "payer_info":   "Pembayaran QRIS",
  "paid_at":      "2026-06-05 14:42:17"
}
```

Header: `X-VXGate-Signature: <hmac-sha256-hex>`

---

### Per-Transaksi Webhook

Tambah `webhook` di `.create()` untuk override global webhook per-order:

```js
const payment = await pay.create({
  amount:    15000,
  webhook:   'https://yourapp.com/orders/17/callback',
});
// Jika paid → POST ke URL ini, bukan global webhook
```

---

### `VXGatePayment.verifyWebhook(rawBody, signature, secret)` → `boolean`

Verifikasi HMAC-SHA256 signature (Node.js).

```js
// Express
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-vxgate-signature'];
  if (!VXGatePayment.verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET))
    return res.sendStatus(401);

  const event = JSON.parse(req.body);
  if (event.event === 'payment.success') {
    fulfillOrder(event.reference_id, event.amount);
  }
  res.sendStatus(200);
});
```

---

### `VXGatePayment.verifyWebhookAsync(rawBody, signature, secret)` → `Promise<boolean>`

Verifikasi webhook (browser-compatible, Web Crypto API).

---

### `.requestOtp(username, password)` / `.verifyOtp(otp)`

Login Orderkuota via API (dibutuhkan sebelum pakai QRIS).

```js
await pay.requestOtp('08xxxx', 'password');
// OTP dikirim ke email Orderkuota

await pay.verifyOtp('12345');
// Sesi tersimpan permanen per API Key
```

---

### `.regenerateKey()` → `Promise<string>`

Generate API Key baru. Key lama langsung tidak berlaku.

```js
const newKey = await pay.regenerateKey();
```

---

## QR Image Endpoint

```
GET /qr.php?ref=REFERENCE_ID&id=TRANSACTION_ID
```

Returns `image/png` langsung — pakai sebagai `<img src="...">`.

- `ref` dan `id` wajib ada dan harus cocok
- Status `paid` → watermark "Paid" di tengah QR
- Status `expired` → watermark "Expired" di tengah QR

---

## Error Handling

```js
import { VXGatePayment, VXGateError, VXGateTimeoutError } from 'vxgate';

try {
  const result = await pay.poll('ORDER-001', { timeoutMs: 60_000 });
} catch (err) {
  if (err instanceof VXGateTimeoutError) {
    console.log(`Timeout setelah ${err.timeoutMs / 1000}s`);
  } else if (err instanceof VXGateError) {
    console.log(`API Error ${err.statusCode}: ${err.message}`);
  }
}
```

| Error class | Kapan |
|-------------|-------|
| `VXGateError` | API return `status: false`, network error |
| `VXGateTimeoutError` | `.poll()` / `.createAndWait()` timeout |

---

## ESM & CJS

```js
// ESM
import { VXGatePayment } from 'vxgate';

// CJS
const { VXGatePayment } = require('vxgate');
```

---

## Links

- [Register & API Key](https://pg.vltcx.eu.cc/register)
- [Documentation](https://pg.vltcx.eu.cc/docs)
- [Dashboard](https://pg.vltcx.eu.cc/dashboard)
- [GitHub](https://github.com/cv3inx/VXGate)
