# vxgate

Violetics Payment Gateway SDK — terima pembayaran QRIS via Orderkuota dengan 3 baris kode.

## Get API Key

1. Daftar di **[pg.vltcx.eu.cc/register](https://pg.vltcx.eu.cc/register)**
2. Verifikasi akun kamu
3. Buka **Dashboard → API Keys** → Generate key baru
4. Copy key dengan format `vlt_xxx` — siap dipakai

## Install

```bash
npm install vxgate
```

## Quick Start

```js
import { VioleticsPayment } from 'vxgate';

const pay = new VioleticsPayment('vlt_YOUR_API_KEY');

// Buat order + poll sampai lunas
const { payment, result } = await pay.createAndWait({
  amount:        15000,
  referenceId:   `ORDER-${Date.now()}`,
  description:   'Pembelian Premium',
  expireMinutes: 30,
});

if (result.paid) {
  console.log(`✅ Lunas via ${result.payerBrand}`);
  console.log(`📱 QR URL: ${payment.qrisUrl}`);
}
```

## API

### `new VioleticsPayment(apiKey, [baseUrl])`

| Param | Type | Description |
|-------|------|-------------|
| `apiKey` | string | API Key kamu (format `vlt_xxx`) |
| `baseUrl` | string | Custom base URL (default: `https://pg.vltcx.eu.cc/api`) |

### `.create(opts)` → `Promise<PaymentData>`

Buat order pembayaran baru.

```js
const payment = await pay.create({
  amount:        15000,          // wajib, nominal dalam Rupiah
  referenceId:   'ORDER-001',    // opsional, auto-generate jika kosong
  description:   'Premium Plan', // opsional
  expireMinutes: 60,             // opsional, default 60 menit
});

// payment.qrisUrl      → URL gambar QR siap tampil ke customer
// payment.amount       → nominal actual (mungkin ada suffix unik +1 s/d +500)
// payment.referenceId  → simpan ini untuk check/poll
// payment.expiresAtHuman → "2026-06-03 15:00:00"
```

### `.check(referenceId)` → `Promise<PaymentResult>`

Cek status pembayaran satu kali.

```js
const result = await pay.check('ORDER-001');
// result.status      → 'pending' | 'paid' | 'expired'
// result.paid        → boolean shortcut
// result.payerBrand  → 'GOPAY' | 'OVO' | 'DANA' | ...
// result.paidAt      → "2026-06-03 14:42:17"
```

### `.poll(referenceId, [opts])` → `Promise<PaymentResult>`

Poll sampai paid/expired atau timeout.

```js
const result = await pay.poll('ORDER-001', {
  intervalMs: 3000,        // cek tiap 3 detik (default: 5000)
  timeoutMs:  600_000,     // timeout 10 menit (default: 300000)
  onPoll: (n, status) => console.log(`[#${n}] ${status}`),
});
```

### `.createAndWait(paymentOpts, [pollOpts])` → `Promise<{payment, result}>`

Shortcut: buat + poll sekaligus. Return object `{ payment, result }` — `payment` berisi data QR dan `result` berisi status akhir.

```js
const { payment, result } = await pay.createAndWait(
  { amount: 15000, referenceId: 'ORDER-001' },
  { intervalMs: 3000, timeoutMs: 300_000 }
);

// Data QR & order ada di `payment`:
console.log(payment.qrisUrl);     // URL gambar QR → tampilkan ke customer
console.log(payment.qrisString);  // string QRIS raw (untuk generate QR sendiri)
console.log(payment.referenceId); // reference ID order
console.log(payment.amount);      // nominal actual (bisa ada suffix unik)

// Status pembayaran ada di `result`:
console.log(result.paid);         // true jika lunas
console.log(result.payerBrand);   // 'GOPAY' | 'OVO' | 'DANA' | ...
```

> **Catatan:** `createAndWait` akan **menunggu** sampai pembayaran `paid` atau `expired`. QR sudah tersedia di `payment` segera setelah fungsi mulai polling — tapi kalau kamu perlu **menampilkan QR dulu** sebelum menunggu, gunakan `.create()` + `.poll()` secara terpisah:
>
> ```js
> // Pattern: tampilkan QR dulu, baru poll
> const payment = await pay.create({ amount: 15000 });
> tampilkanQR(payment.qrisUrl); // langsung tampilkan ke user
>
> const result = await pay.poll(payment.referenceId, {
>   onPoll: (n, status) => console.log(`[#${n}] ${status}`),
> });
> if (result.paid) console.log('Lunas!');
> ```

### `.list([opts])` → `Promise<Transaction[]>`

Daftar transaksi.

```js
const txs = await pay.list({ limit: 20, offset: 0 });
```

### `.requestOtp(username, password)` / `.verifyOtp(otp)`

Login Orderkuota via API.

```js
await pay.requestOtp('08xxxx', 'password');
await pay.verifyOtp('123456');
```

### `.setWebhook(url)` → `Promise<{webhookUrl, webhookSecret}>`

Konfigurasi webhook URL.

```js
const { webhookSecret } = await pay.setWebhook('https://yourapp.com/webhook');
// Simpan webhookSecret untuk verifikasi signature
```

### `VioleticsPayment.verifyWebhook(rawBody, signature, secret)` → `boolean`

Verifikasi HMAC-SHA256 webhook signature (Node.js).

```js
// Express handler
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-violetics-signature'];
  if (!VioleticsPayment.verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET))
    return res.sendStatus(401);

  const event = JSON.parse(req.body);
  if (event.event === 'payment.success') {
    fulfillOrder(event.reference_id);
  }
  res.sendStatus(200);
});
```

### `VioleticsPayment.verifyWebhookAsync(rawBody, signature, secret)` → `Promise<boolean>`

Verifikasi webhook (browser-compatible, Web Crypto API).

## Error Handling

```js
import { VioleticsPayment, VioleticsError, VioleticsTimeoutError } from 'vxgate';

try {
  const result = await pay.poll('ORDER-001', { timeoutMs: 60_000 });
} catch (err) {
  if (err instanceof VioleticsTimeoutError) {
    console.log('Payment belum masuk setelah 60 detik');
  } else if (err instanceof VioleticsError) {
    console.log(`API Error ${err.statusCode}: ${err.message}`);
  }
}
```

## ESM & CJS

Package support keduanya:

```js
// ESM
import { VioleticsPayment } from 'vxgate';

// CJS
const { VioleticsPayment } = require('vxgate');
```

## Links

- [Register](https://pg.vltcx.eu.cc/register) — daftar & dapatkan API key
- [Documentation](https://pg.vltcx.eu.cc/docs)
- [Dashboard](https://pg.vltcx.eu.cc/dashboard)
- [GitHub](https://github.com/cv3inx/VXGate)
