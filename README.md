# Panda Key 🐼
### Music Analysis & DJ Library (Cloudflare local-first edition)

Panda Key เป็นแอปพลิเคชันสำหรับวิเคราะห์ข้อมูลเพลง DJ คัดแยกจังหวะ (BPM) คีย์เพลง (Musical/Camelot Key) พลังงานของเพลง (Energy) และจัดการ Playlist บนสแต็ก Cloudflare ไร้รอยต่อ โดยรวบรวมเทคโนโลยี Cloudflare Pages, D1 Database, R2 File Storage, Cloudflare Queues และวิเคราะห์เสียงด้วยโมเดล Python (Librosa/Mutagen)

---

## ✨ ฟีเจอร์เด่นและความสามารถล่าสุด (Key Features & Updates)

- **HTTP Range Requests (206 Partial Content)**: ระบบเล่นเพลงสตรีมมิ่งผ่าน R2 รองรับ HTTP Range header ทำให้เบราว์เซอร์สามารถ Seek เลื่อนเวลาเพลงและเล่นต่อเนื่องได้โดยไม่ขาดตอน
- **การเพิ่มเพลงเข้าเพลย์ลิสต์/คอลเลกชันด้วย Drag & Drop**: สามารถลากแถวเพลงจากตารางไปวางบนชื่อ Playlist หรือ Collection ใน Sidebar ได้โดยตรง
- **ความหน่วงในการเปลี่ยนเพลงเป็นศูนย์ (Zero-Latency Audio Playback)**:
  - ใช้ **Browser Caching** ด้วยการส่ง `Cache-Control` สูงสุด ทำให้โหลดไฟล์เสียงจากแคชของเครื่องทันทีเมื่อเปิดเล่นซ้ำ (ลดภาระเน็ตเวิร์กและเข้าข่าย 0ms latency)
  - ปรับการเชื่อมโยง WaveSurfer แบบ **Background Fetch** เพื่อเร่งดาวน์โหลดและประมวลผลคลื่นเสียงผ่านคำขอ AJAX (Fetch API) ขนานไปกับการเล่นเสียง ป้องกันการกระตุกของเบราว์เซอร์ขณะเริ่มเล่นเพลงใหม่
- **กราฟคลื่นเสียงเรืองแสงสไตล์ Cyberpunk (Cyberpunk Solid Waveform with Neon Glow)**:
  - ปรับโฉมแผงเล่นเพลง DJ (ทั้งฝั่ง Zoomed และ Overview) เป็นแบบ **Solid Waveform** (ถมสีทึบต่อเนื่องกึ่งโปร่งแสง ให้มองทะลุตารางกริดด้านหลังจางๆ)
  - เส้นขอบขอบบนและล่างตัดด้วย **Bright Neon Outline** ที่ใส่เอฟเฟกต์เงาฟุ้งสะท้อนแสงนีออน (`shadowBlur`)
  - คลื่นเสียงจะไล่สีแนวราบตามความถี่จริงของเพลงแบบ **Dynamic Horizontal Gradient** (สีเขียวนีออนสำหรับช่วงเสียงทุ้ม/เบส, สีชมพูนีออนสำหรับช่วงเสียงกลาง, และสีฟ้านีออนสำหรับช่วงเสียงแหลม)
  - พัฒนาการเรนเดอร์ผ่าน HTML5 Canvas 2D ให้มีความเสถียรและประมวลผลด้วยเฟรมเรตสูงด้วยการเก็บ Gradient แคชและวาดต่อเนื่องแบบไร้ช่องว่าง

---

## 🛠 Prerequisites (สิ่งที่ต้องติดตั้งในระบบก่อน)

1. **Node.js** (v18+)
2. **Python 3.9+**
3. **ffmpeg** (ต้องดาวน์โหลดและติดตั้งใน System PATH เพื่อให้ Python สามารถถอดรหัสไฟล์เสียง MP3/WAV/FLAC ได้)

---

## 🚀 ขั้นตอนการติดตั้งและการพัฒนาภายในเครื่อง (Local Setup)

โปรเจกต์แยกส่วนการทำงานออกเป็น 3 ส่วนหลัก:
1. **Frontend & Worker API**: Next.js App Router ทำหน้าที่รันบอร์ดจัดการและจุดเชื่อมต่อ API
2. **Queue Consumer Worker**: ทำหน้าที่รับคิวอัปโหลดเพลงเพื่อส่งไปให้ Python Worker วิเคราะห์
3. **Python FastAPI Audio Worker**: บริการประมวลผลข้อมูลเสียงเชิงลึก (วิเคราะห์ BPM, คีย์, พลังงาน และเขียนแท็กไฟล์เสียง)

---

### ส่วนที่ 1: การตั้งค่าฐานข้อมูล D1 และรัน Next.js App

1. เปิด Terminal ในโฟลเดอร์โปรเจกต์หลัก (`panda-key-web`)
2. ติดตั้ง Node dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. รันการติดตั้ง/ย้ายฐานข้อมูล D1 ในเครื่อง (Local Migration):
   ```bash
   npx wrangler d1 migrations apply pandakey-db --local
   ```
4. เริ่มรัน Next.js บน Pages Local Emulation (เพื่อใช้ D1/R2/Queues local bindings):
   ```bash
   npx wrangler pages dev --port 3000 -- npx next dev
   ```
   *บราวเซอร์จะเปิดทำงานที่: [http://localhost:3000](http://localhost:3000)*

---

### ส่วนที่ 2: การเปิดรัน Queue Consumer Worker

เพื่อให้คิวงานรับข้อความจาก Next.js ไปส่งต่อให้ Python Worker ได้ จำเป็นต้องเปิดรัน Consumer เสมือนในเครื่อง:

1. เปิด Terminal แท็บใหม่และย้ายเข้าโฟลเดอร์ย่อย:
   ```bash
   cd worker-consumer
   ```
2. รัน Worker Consumer:
   ```bash
   npx wrangler dev
   ```
   *หมายเหตุ: Consumer จะทำงานคอยดักรับข้อความผ่าน Cloudflare Queue และเรียกใช้ API ของ Python ในเครื่องที่พอร์ต `8000`*

---

### ส่วนที่ 3: การตั้งค่ารัน Python Audio Worker

1. เปิด Terminal แท็บใหม่และย้ายเข้าโฟลเดอร์:
   ```bash
   cd python-worker
   ```
2. สร้างสภาพแวดล้อมจำลอง (Virtual Environment):
   ```bash
   python -m venv venv
   # บน Windows รัน:
   venv\Scripts\activate
   # บน Mac/Linux รัน:
   source venv/bin/activate
   ```
3. ติดตั้งไลบรารีที่ระบุใน requirements:
   ```bash
   pip install -r requirements.txt
   ```
4. สร้างไฟล์กำหนดค่า `.env` (คัดลอกตัวอย่างจากโค้ดได้เลย):
   ```env
   WORKER_API_URL=http://localhost:3000
   API_SECRET=pandakey_super_secret_token_123!
   ```
5. สั่งรันเว็บบริการด้วย Uvicorn:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

---

## 📈 วิธีการทดสอบระบบ (Workflow Testing)

1. เข้าชมเว็บที่หน้า [http://localhost:3000](http://localhost:3000)
2. ทำการสมัครสมาชิกใหม่ที่หน้า **Register** และลงชื่อเข้าใช้งาน
3. กดปุ่ม **"＋ Add Files"** บนเมนูด้านซ้าย เลือกไฟล์เพลง (.mp3, .wav, .flac หรือ .m4a)
4. สังเกตหน้าจอ:
   - เพลงจะถูกประเมินขนาดและประเภท ก่อนขอ **R2 Presigned Upload URL**
   - บราวเซอร์จะทำการอัปโหลดไฟล์เพลงตรงไปยัง R2 Local Bucket เสมือน
   - หลังจากอัปโหลดเสร็จ คิวงานวิเคราะห์ (Job) จะถูกเพิ่มใน D1 และส่งสารผ่าน **Queues**
   - **Queue Consumer Worker** จะรับคิวและยิงคำขอไปยัง **Python FastAPI**
   - Python จะถอดรหัสเพลง คัดแยก BPM, คีย์ และพลังงาน ก่อนเรียกกลับมาอัปเดตสถานะที่ API หน้าเว็บ
   - บอร์ดหน้าเว็บจะอัปเดตข้อมูล BPM, Camelot Key, ระดับพลังงาน และเวลาของเพลงแบบเรียลไทม์!

---

## ⚠️ ข้อจำกัดและประเด็นสำคัญ (Known Limitations)

- **การจัดเก็บข้อมูลภายในเครื่อง (Local Storage)**: Cloudflare D1 เสมือนและ R2 จะจัดเก็บไฟล์จริงในโฟลเดอร์ซ่อน `.wrangler/state/v3/d1` และ `.wrangler/state/v3/r2` หากมีการลบโฟลเดอร์เหล่านี้ข้อมูลจะถูกล้างใหม่ทั้งหมด
- **ไลบรารี Librosa**: จำเป็นต้องใช้ `ffmpeg` สำหรับถอดรหัส (decode) รูปแบบเสียงบีบอัดอย่าง MP3 และ M4A กรุณาตรวจสอบให้แน่ใจว่าติดตั้งลงในระบบอย่างถูกต้องแล้ว
