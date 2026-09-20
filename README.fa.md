# MTTESTER

**تست بار HTTP — CLI + رابط وب + Docker**

آدرس سایت را بده، ۵۰ / ۱۰۰ / ۱۰۰۰ کاربر مجازی زنده روی آن بریز، و ببین چه چیزی تحمل کرد و چه چیزی شکست.

> English: [README.md](./README.md)

---

## شروع سریع با Docker

```bash
git clone https://github.com/OWNER/mttester.git
cd mttester
docker-compose up --build -d
```

باز کن: **http://localhost:3000**

```bash
docker-compose down
```

---

## شروع سریع با CLI

```bash
npm install

node bin/mttester.js mock -p 8080
node bin/mttester.js url http://127.0.0.1:8080/health -u 50 -d 10s
node bin/mttester.js url http://127.0.0.1:8080/health -u 1000 -d 30s --confirm-high-load
node bin/mttester.js selftest
```

رابط وب محلی:

```bash
npm run web
# → http://localhost:3000
```

---

## قابلیت‌ها

- رابط وب با عنوان **MTTESTER**
- حالت VU و حالت نرخ ثابت (RPS)
- استخر worker — coordinator خودش HTTP نمی‌زند
- چک و آستانه با تفکیک خطای درخواست از خطای assertion
- گزارش کنسول / JSON / CSV / HTML
- گیت ایمنی: مجوز، اجرای محدود، تأیید بار بالا
- فارسی و انگلیسی برای خروجی انسانی CLI

---

## استفاده مسئولانه

**فقط روی سیستم‌هایی که مال شماست یا اجازهٔ کتبی دارید تست کنید.**

تست غیرمجاز می‌تواند غیرقانونی باشد. MTTESTER تأیید مجوز، مدت محدود، و برای بار بالا تأیید صریح می‌خواهد.

---

## توسعه

```bash
npm test
npm run typecheck
```

نیازمندی: Node.js ≥ 22 — تنها dependency زمان اجرا: `undici`

## مجوز

MIT
