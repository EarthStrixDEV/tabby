<div align="center">

# Tabby

**สมุดจดหนี้เพื่อน** แอป CRUD ขนาดเล็กสำหรับทดสอบ Shared Web Hosting

ใช้หน้าเว็บ ฐานข้อมูล และ API ชุดเดียวกัน แต่เขียน backend 4 แบบ (Apache · Nginx · Node · Python)<br>
เพื่อวัดว่าโฮสต์รันแต่ละ stack ได้ถูกต้องและเร็วแค่ไหน

<img src="docs/screenshots/desktop-list.png" alt="หน้ารายการหนี้บนเดสก์ท็อป: sidebar สีเข้ม การ์ดสรุป 3 ใบ ตัวกรอง และตารางรายการ" width="860">

</div>

---

## สถานะ

| Stack | สถานะ |
|---|---|
| Apache + PHP 8.x | ✅ เสร็จ |
| Nginx + PHP-FPM (โค้ด PHP ชุดเดียวกัน) | ✅ เสร็จ ใช้ `nginx/nginx-snippet.conf` |
| Node + Express | ⏳ ยังไม่เริ่ม |
| Python + Flask | ⏳ ยังไม่เริ่ม |

ทุก stack ต้องผ่าน contract test ชุดเดียวกันใน `tests/contract/`

## หน้าตา

<table>
<tr>
<td width="50%"><img src="docs/screenshots/mobile-list.png" alt="รายการหนี้บนมือถือ แบ่งกลุ่มตามวัน พร้อมปุ่มติ๊กจ่ายแล้วและปุ่มเพิ่มรายการ"></td>
<td width="50%"><img src="docs/screenshots/mobile-form.png" alt="ฟอร์มเพิ่มรายการบนมือถือ พร้อมปุ่มกรอกชื่อและจำนวนเงินแบบเร็ว"></td>
</tr>
<tr>
<td align="center">รายการหนี้ (มือถือ)</td>
<td align="center">เพิ่มรายการ (มือถือ)</td>
</tr>
</table>

<img src="docs/screenshots/desktop-test.png" alt="หน้าทดสอบระบบบนเดสก์ท็อป: ช่องรหัสทดสอบ การ์ด Bandwidth, Caching และ API Request" width="860">

## ทำอะไรได้บ้าง

**หน้า `/`: สมุดจดหนี้**

- ดูยอดค้างรวม จำนวนเพื่อนที่ติดเงิน และจำนวนรายการค้างจ่าย
- กรองรายการ ทั้งหมด / ยังไม่จ่าย / จ่ายแล้ว แบ่งหน้าละ 20 แถว
- เพิ่ม แก้ไข และลบรายการ (ลบต้องกดยืนยันก่อน)
- ติ๊กว่าจ่ายแล้ว และกด "เลิกทำ" ได้ภายใน 5 วินาที
- มือถือแสดงเป็นการ์ดแบ่งกลุ่มตามวัน เดสก์ท็อป (≥ 900px) แสดงเป็นตาราง

**หน้า `/test`: เครื่องมือทดสอบโฮสต์**

| เครื่องมือ | วัดอะไร |
|---|---|
| Bandwidth | ความเร็วดาวน์โหลด/อัปโหลด 1 · 10 · 100 MB, TTFB, 5 connection พร้อมกัน |
| Caching | ETag, Cache-Control, 304, no-store, cache ฝั่ง server, gzip, app cache, ไฟล์ static |
| API Request | Load test (สูงสุด 1,000 request / 50 พร้อมกัน), ค่าเฉลี่ย มัธยฐาน p95 req/s และ histogram |

Endpoint ที่กินทรัพยากรหนักทุกตัวต้องส่ง header `X-Test-Token` มาด้วย

## โครงสร้าง

```
tabby/
├── shared/
│   ├── public/            หน้าเว็บที่ใช้ร่วมกันทุก stack (ไฟล์เดียวกันทุก byte)
│   │   ├── index.html     หน้า /
│   │   ├── test.html      หน้า /test
│   │   └── static/        css · js (ES modules ไม่มี build step) · fonts
│   └── schema.sql         ตาราง debts + rate_limits (utf8mb4)
├── apache/                backend PHP ใช้ทั้ง Apache และ Nginx
│   ├── public/            index.php (front controller) + .htaccess
│   ├── src/               Router, Http, Db, Validation, DebtRepo, AppCache, handlers/
│   └── config.sample.php  ต้นแบบ config (ตัวจริงห้าม commit)
├── nginx/                 nginx-snippet.conf
├── scripts/               assemble · db-reset · serve-apache
├── tests/
│   ├── contract/          black-box API test (node:test) ใช้ซ้ำได้ทุก stack
│   ├── unit/              test ของ JS module ฝั่งหน้าเว็บ
│   └── e2e/               Playwright: flow, a11y, responsive
├── design-handoff/        สเปค UI, tokens และบอร์ดอ้างอิงจากดีไซเนอร์
└── docs/                  LOCAL-DEV.md · plan · screenshots
```

## เริ่มใช้งานในเครื่อง

ต้องมี **Node 22+** และ **PHP 8.x + MySQL 8** (บน Windows ใช้ [Laragon](https://laragon.org) ได้)

```bash
npm install
cp apache/config.sample.php apache/config.php   # ใส่ค่าตาม docs/LOCAL-DEV.md
npm run db:reset                                # สร้างฐาน tb_local จาก schema.sql
npm run serve                                   # http://127.0.0.1:8080
```

อยากได้ข้อมูลตัวอย่าง:

```bash
curl -X POST -H "X-Test-Token: <TEST_TOKEN>" "http://127.0.0.1:8080/api/seed?n=30&reset=1"
```

รายละเอียดการตั้งค่า (PATH ของ Laragon, ค่าใน config, การรันบน Apache จริง) อยู่ใน **[docs/LOCAL-DEV.md](docs/LOCAL-DEV.md)**

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run serve` | รันด้วย PHP built-in server ที่ `:8080` |
| `npm run serve:apache` | รันด้วย Apache จริงที่ `:8081` ใช้ทดสอบ `.htaccess` |
| `npm run db:reset` | ล้างและสร้างฐานข้อมูลใหม่ |
| `npm run test:unit` | unit test ของ JS |
| `npm run test:contract` | contract test ของ API |
| `npm run test:e2e` | Playwright end-to-end |

เปลี่ยนเป้าหมายของ test ได้ด้วย `BASE_URL` เช่น `BASE_URL=http://127.0.0.1:8081 npm run test:contract`

## API

| Method | Path | หน้าที่ |
|---|---|---|
| `GET` | `/api/debts?page=&per_page=&paid=` | รายการหนี้ เรียง id ใหม่สุดก่อน |
| `GET · PUT · DELETE` | `/api/debts/{id}` | อ่าน แก้ (แทนทั้งแถว) ลบ |
| `POST` | `/api/debts` | เพิ่มรายการ ตอบ 201 |
| `GET` | `/api/summary` | ยอดรวมและตัวนับ (มี app cache 10 วินาที) |
| `GET` | `/api/ping` · `/api/echo` · `/api/limited` | ping, สะท้อน request, rate limit 10 ครั้ง/นาที |
| `GET` | `/api/slow?ms=` 🔒 | หน่วงเวลาได้ถึง 10 วินาที |
| `POST · DELETE` | `/api/seed` 🔒 | สร้าง/ลบข้อมูลจำลอง |
| `GET` | `/download/{1\|10\|100}` 🔒 | ส่งไฟล์สุ่มแบบ stream |
| `POST` | `/upload` 🔒 | รับไฟล์ นับขนาด แล้วทิ้ง |
| `GET` | `/cache/static` · `/none` · `/time` · `/gzip` | endpoint สำหรับทดสอบแคช |

🔒 = ต้องส่ง `X-Test-Token` มาด้วย

จำนวนเงินรับส่งเป็น string ทศนิยม 2 ตำแหน่ง (`"150.00"`) เวลาเป็น UTC ISO 8601 ข้อผิดพลาดตอบเป็น JSON `{"error": "..."}` ทุกกรณี และไม่มี stack trace หลุดออกไป

## หลักที่ยึดไว้

- **ไม่มี build step และไม่มี framework**: HTML + CSS + vanilla JS ใช้ font ที่ host เอง ไม่เรียก CDN
- **หน้าเว็บเดียวกันทุก stack**: ผลต่างที่วัดได้จึงมาจากโฮสต์ ไม่ใช่จากหน้าเว็บ
- **ปลอดภัยไว้ก่อน**: ใช้ prepared statement ทุกจุด ใส่ข้อความลง DOM ด้วย `textContent` เท่านั้น เทียบ token แบบ constant-time และเก็บ config ไว้นอก docroot
- **เข้าถึงได้**: จุดกดใหญ่อย่างน้อย 44px, contrast ≥ 4.5:1, ใช้คีย์บอร์ดได้ครบ และรองรับ reduced motion
- **ภาษาไทยทั้งแอป**: ใช้ Prompt + Noto Sans Thai และแสดงวันที่เป็นปี พ.ศ. ตามเวลา Asia/Bangkok

## เอกสาร

- [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md): ตั้งค่าและรันในเครื่อง
- [design-handoff/design-handoff/DESIGN-tabby.md](design-handoff/design-handoff/DESIGN-tabby.md): สเปค UI
- [design-handoff/SPEC-tabby.txt](design-handoff/SPEC-tabby.txt): สเปค backend, API และแผนทดสอบ
- [design-handoff/SPEC-CHANGES.md](design-handoff/SPEC-CHANGES.md): ข้อกำหนดที่เพิ่มระหว่าง implement ซึ่งทุก stack ต้องทำตาม
- [docs/superpowers/plans/](docs/superpowers/plans/): แผน implement

> ใช้ข้อมูลจำลองเท่านั้น ห้ามกรอกชื่อหรือยอดหนี้ของเพื่อนจริง และเมื่อทดสอบบนโฮสต์เสร็จแล้ว ให้ปิด endpoint ทดสอบทุกตัว
