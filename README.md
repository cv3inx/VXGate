# vxgate

Violetics Payment Gateway SDK — terima pembayaran QRIS via Orderkuota dengan 3 baris kode.

## Install

```bash
npm install vxgate
```

## Quick Start

```js
import { VXGatePayment } from 'vxgate';

const pay = new VXGatePayment('vlt_YOUR_API_KEY');

// Buat order + tampilkan QR + tunggu lunas
const payment = await pay.create({
  amount:        15000,
  referenceId:   `ORDER-${Date.now()}`,
  expireMinutes: 30,
});

console.log(payment.qrisUrl); // tampilkan ke customer

const result = await pay.poll(payment.referenceId);
if (result.paid) console.log(`Lunas via ${result.payerBrand}`);
```

## Links

- [Register](https://pg.vltcx.eu.cc/register) — daftar & dapatkan API key
- [Documentation](https://pg.vltcx.eu.cc/docs) — full API reference
- [Dashboard](https://pg.vltcx.eu.cc/dashboard)
- [GitHub](https://github.com/cv3inx/VXGate)
