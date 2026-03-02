# ⚡ Antigravity Auto Accept & Retry

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
[![Shop](https://img.shields.io/badge/🛒_Shop-nemarkdigital.com-orange)](https://shop.nemarkdigital.com)

> Tự động Accept commands & Retry khi lỗi trong Antigravity IDE

**Phát triển bởi [Nemark Digital](https://shop.nemarkdigital.com)** — Shop Account Ultra

---

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| ✅ **Auto Accept** | Tự động nhấn Accept khi Antigravity yêu cầu phê duyệt command |
| 🔄 **Auto Retry** | Tự động Retry khi command thất bại |
| ⚡ **Quick Toggle** | Nút ON/OFF nhanh ở status bar (góc phải) |
| ⚙️ **Configurable** | Tùy chỉnh scan interval, auto-start, vị trí nút |
| 📖 **Welcome Guide** | Trang hướng dẫn sử dụng có sẵn |

## 🚀 Cài đặt

### VS Code / Antigravity IDE (VSIX)
```
Ctrl+Shift+X → ... → Install from VSIX → chọn file .vsix
```

### Chrome Extension
1. `chrome://extensions/` → Enable Developer mode
2. **Load unpacked** → chọn thư mục extension

## 📖 Cách sử dụng

### 1. Tự động chạy
Extension sẽ tự kích hoạt khi mở IDE. Bạn sẽ thấy:

```
⚡ Auto-Accept: ON
```

ở góc **phải dưới** màn hình.

### 2. Bật/Tắt nhanh
- **Click** vào nút `⚡ Auto-Accept: ON` trên status bar
- Hoặc `Ctrl+Shift+P` → `Auto Accept: Toggle ON/OFF`

### 3. Cấu hình
Mở Settings (`Ctrl+,`) → tìm `Auto Accept`:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Tự bật khi mở IDE |
| `autoRetry` | `true` | Tự retry khi lỗi |
| `scanInterval` | `2000` | Thời gian scan (ms) |
| `statusBarPosition` | `right` | Vị trí nút (left/right) |

## 🏪 Nemark Digital Shop

💎 **Mua Account Ultra** để sử dụng Antigravity không giới hạn!

🛒 **[shop.nemarkdigital.com](https://shop.nemarkdigital.com)**

- ✅ Account chất lượng cao
- ✅ Hỗ trợ 24/7
- ✅ Giá cả hợp lý

## 📝 Changelog

### v0.2.0
- ✅ Thêm nút ON/OFF nhanh ở status bar (góc phải)
- ✅ Trang Welcome với hướng dẫn sử dụng
- ✅ Tích hợp branding Nemark Digital
- ✅ Walkthrough steps
- ✅ Cấu hình mở rộng

### v0.1.0
- ✅ Auto Accept cơ bản
- ✅ Auto Retry
- ✅ Browser extension (Chrome)

## License

MIT — Made with ❤️ by [Nemark Digital](https://shop.nemarkdigital.com)
