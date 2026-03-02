# ⚡ AG Auto Click & Scroll v7.4

> Tự động nhấn nút **Run / Allow / Accept** và cuộn khung chat Antigravity.  
> Smart Accept — chỉ click ở chat, không click ở diff editor.

![Version](https://img.shields.io/badge/version-7.4.1-blue)
![Downloads](https://img.shields.io/open-vsx/dt/nemark/auto-accept-scroll)
![Rating](https://img.shields.io/open-vsx/rating/nemark/auto-accept-scroll)

---

## 🚀 Tính năng chính

### ✅ Smart Accept v7.4
- **Auto-click** các nút: `Run`, `Allow`, `Accept`, `Retry`, `Continue`, `Keep Waiting`, `Allow Once`...
- **Smart detection** — CHỈ click trong khung chat, KHÔNG BAO GIỜ click ở diff/merge editor
- **Commands API** — sử dụng API nội bộ của Antigravity, ổn định hơn DOM click
- **Configurable patterns** — bật/tắt từng nút riêng biệt

### 📜 Auto Scroll
- Tự cuộn khung chat xuống cuối khi có tin nhắn mới
- Jitter-free — mượt mà, không bị giật

### ⚙️ Settings Panel
- Giao diện cài đặt trực quan ngay trong VS Code
- Bật/tắt Accept & Scroll độc lập
- Tùy chỉnh chu kỳ scan (ms)
- Quản lý patterns (nút nào cần auto-click)

### 🔄 Auto Re-inject (v7.4 NEW!)
- Tự động phát hiện khi Antigravity cập nhật bản mới
- Tự inject lại script — không cần thao tác thủ công
- Chỉ cần cài extension một lần, mọi thứ tự động từ A đến Z!

### 🖥️ Native Dialog Support
- Tự nhấn **Keep Waiting** trong native Windows dialog
- Không bỏ lỡ bất kỳ prompt nào

---

## 📦 Cài đặt

### Từ Open VSX Registry
1. Mở **Extensions** trong Antigravity / VS Code
2. Tìm **"AG Auto Click & Scroll"**
3. Nhấn **Install**

### Từ VSIX file
1. Download file `.vsix` mới nhất
2. Mở Command Palette (`Ctrl+Shift+P`)
3. Chọn **"Extensions: Install from VSIX..."**
4. Chọn file `.vsix` đã tải

---

## 🎮 Sử dụng

### Bật/Tắt nhanh
- Click nút **✓ Accept ON** / **↓ Scroll ON** ở thanh status bar
- Hoặc dùng Command Palette → `Auto Accept: Toggle Accept ON/OFF`

### Commands
| Command | Mô tả |
|---|---|
| `Auto Accept: Enable (Inject & Reload)` | Inject script và reload VS Code |
| `Auto Accept: Disable (Remove & Reload)` | Gỡ script và reload |
| `Auto Accept: Toggle Accept ON/OFF` | Bật/tắt auto-click |
| `Auto Accept: Toggle Scroll ON/OFF` | Bật/tắt auto-scroll |
| `Auto Accept: Open Settings` | Mở bảng Settings |

### Cấu hình

| Setting | Mặc định | Mô tả |
|---|---|---|
| `acceptEnabled` | `true` | Bật/tắt auto-click |
| `scrollEnabled` | `true` | Bật/tắt auto-scroll |
| `clickInterval` | `1000 ms` | Chu kỳ kiểm tra nút click |
| `scrollInterval` | `500 ms` | Chu kỳ kiểm tra scroll |
| `commandsApiEnabled` | `true` | Dùng Commands API (ổn định hơn) |
| `nativeDialogEnabled` | `true` | Auto-click trong Windows dialog |

---

## 📝 Changelog

### v7.4.0 — Auto Re-inject
- ✅ Tự động re-inject khi Antigravity cập nhật
- ✅ UI đơn giản hóa — bỏ các option không cần thiết

### v7.3.0 — Smart Accept
- ✅ Smart detection: chỉ click trong chat panel
- ✅ Commands API integration
- ✅ Native Windows dialog support

---

## 💎 Nemark Digital — Dịch vụ AI Premium

> **Cùng tính năng, giá chỉ bằng 1/10 nền tảng gốc!**

Extension này được phát triển bởi **Nemark Digital**. Ngoài extension miễn phí, chúng tôi còn cung cấp các dịch vụ AI Premium:

### 🔥 Gói Gemini Ultra — All-in-One AI Package

| Tính năng | Chi tiết |
|---|---|
| 🧠 **Gemini Ultra** | Model AI mạnh nhất Google — KHÔNG giới hạn |
| ⚡ **Antigravity Ultra** | Claude Max Opus 4.6 — AI coding chuyên sâu |
| 💻 **CLI Claude** | Code, debug, quản lý git từ terminal |
| 🤖 **CLI Gemini** | AI assistant dòng lệnh — Google Gemini 2.5 Pro |
| 🎬 **Veo 3** | Tạo video AI chất lượng cao |
| ☁️ **30TB Drive** | Kho lưu trữ Google Drive khổng lồ |

**💰 Giá chỉ bằng 1/10 so với đăng ký gốc!**

### Các gói dịch vụ khác
- **ChatGPT Plus** — GPT-5.2, Codex 5.3, DALL-E 3
- **Cursor + ClaudeCode + Augment (3 in 1)** — 150 prompt/ngày
- **Gemini AI Pro** — Family plan, 5 slots
- **CapCut Pro** — Chỉnh sửa video chuyên nghiệp
- **Canva EDU** — Design không giới hạn
- **Adobe Creative Cloud** — Full apps, 3 tháng

### 🎁 Ưu đãi
- ✅ **Kích hoạt tức thì** — Đăng nhập là dùng ngay
- ✅ **Bảo hành 20-30 ngày** — Lỗi đổi 1:1
- ✅ **Hỗ trợ 24/7** — Zalo & Messenger
- ✅ **Giới thiệu bạn bè** → Giảm 5% + Hoa hồng 10%

### 📲 Liên hệ
- 🌐 **Website:** [shop.nemarkdigital.com](https://shop.nemarkdigital.com)
- 📞 **Hotline/Zalo:** [0376 263 452](https://zalo.me/0376263452)
- 👥 **Nhóm Zalo:** [Tham gia ngay](https://zalo.me/g/lkpdcp507)
- 👥 **Facebook:** [Vibecoding007](https://www.facebook.com/groups/vibecoding007/)

---

## ☕ Ủng hộ tác giả

Nếu extension giúp ích cho bạn, mời tác giả một ly cà phê nhé! 🧡  
Quét mã QR qua **Momo**, **VietQR** hoặc **Napas 247**.

---

## 📄 License

Provided license — © 2025 Nemark Digital Solutions. All rights reserved.

**Website:** [shop.nemarkdigital.com](https://shop.nemarkdigital.com) | **Email:** support@mtdvps.com
