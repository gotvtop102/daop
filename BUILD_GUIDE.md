# DAOP Movie – Build Guide (Android APK + iOS TestFlight)

Tài liệu này hướng dẫn **cài đặt môi trường** và **build app** từ repo `daop-movie`.

Repo hiện dùng **Capacitor** để bọc web thành app:
- App load **remote URL** (website) qua biến `CAPACITOR_SERVER_URL`
- Android build ra **2 bản**: `phone` và `tv`
- iOS (tuỳ chọn) build và upload **TestFlight** (bắt buộc macOS + Xcode)

---

## 1) Yêu cầu chung

- **Node.js**: đã cài (khuyến nghị Node LTS).  
  Kiểm tra:

```bash
node -v
```

- Link tải Node.js (LTS): `https://nodejs.org/en/download`

- Repo đã cài dependencies ở root (bạn có thể bỏ qua nếu đã có `node_modules/`).

---

## 2) Build Android APK (Windows) – Phone + TV

### 2.1 Cài Android Studio + SDK

- Cài **Android Studio**
- Link tải Android Studio: `https://developer.android.com/studio`
- Mở Android Studio → **SDK Manager**:
  - Cài **Android SDK Platform** (khuyến nghị API 33/34)
  - Cài **Android SDK Build-Tools**
  - Cài **Android SDK Platform-Tools**

> Lần đầu build có thể mất **10–25 phút** do tải Gradle/dependencies.

### 2.2 Fix PowerShell chặn `npm`/`npx` (nếu gặp)

Nếu chạy `npm install` báo lỗi kiểu:
`npm.ps1 cannot be loaded because running scripts is disabled...`

Chọn 1 trong 2 cách:

**Cách A (khuyên dùng)**: cho phép script với user hiện tại:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Cách B**: dùng `cmd` thay vì PowerShell:

```bat
npm.cmd install
npx.cmd cap add android
```

### 2.3 Cài dependencies cho Capacitor app

Trong PowerShell:

```powershell
cd "C:\Users\ADMIN\Desktop\DAOP\daop-movie\app"
npm install
```

### 2.4 Set JAVA_HOME (bắt buộc để Gradle chạy)

> **Quan trọng**: Template Android hiện tại dùng Gradle 8.0.2, build ổn nhất với **JDK 17**.  
> Nếu bạn đang dùng **JDK 21** có thể gặp lỗi: `Unsupported class file major version 65`.

Nếu build báo:
`JAVA_HOME is not set and no 'java' command could be found in your PATH`

#### 2.4.1 Cài JDK 17 (khuyến nghị)

- Cài **Eclipse Temurin (Adoptium) JDK 17** (Windows x64).
- Link tải Temurin/Adoptium JDK 17: `https://adoptium.net/temurin/releases/?version=17`
- Sau khi cài, thường sẽ có thư mục kiểu:
  - `C:\Program Files\Java\jdk-17...`
  - hoặc `C:\Program Files\Eclipse Adoptium\jdk-17...`

Kiểm tra nhanh (PowerShell):

```powershell
java -version
```

Nếu chưa nhận `java` thì set `JAVA_HOME` + `Path` như bên dưới.

#### 2.4.2 Dùng JDK đi kèm Android Studio (jbr)

Với Android Studio cài ở `C:\Program Files\Android\Android Studio`, JDK thường ở:
`C:\Program Files\Android\Android Studio\jbr`

Set tạm cho phiên PowerShell hiện tại:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

> Nếu `java -version` chạy OK là xong.

#### 2.4.3 Nếu vẫn lỗi Gradle/JDK

Nếu bạn vẫn gặp lỗi major version (65), hãy trỏ `JAVA_HOME` về **JDK 17** (không dùng JDK 21):

```powershell
$env:JAVA_HOME="C:\Program Files\Java\jdk-17"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

### 2.5 Build APK phone + TV (load remote URL)

Trong thư mục `app/`:

```powershell
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "DAOP Phim"
```

Nếu muốn set icon theo URL ảnh:

```powershell
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "DAOP Phim" --iconUrl "https://YOUR_ICON_URL.png"
```

### 2.6 Output APK ở đâu?

APK được copy ra:
- `app/dist/apk/`

Bạn sẽ thấy 2 file dạng:
- `daop-phone-<timestamp>.apk`
- `daop-tv-<timestamp>.apk`

> Gợi ý: nên upload 2 file này lên host của bạn và tạo **2 link tải riêng**:
> - Link **app điện thoại**: trỏ vào file `daop-phone-*.apk`
> - Link **app Android TV**: trỏ vào file `daop-tv-*.apk`

### 2.7 Cài APK lên thiết bị

- **Android phone**: cắm cáp hoặc chép file → mở APK để cài (bật “Install unknown apps” nếu cần)
- **Android TV/TV Box**: dùng đúng file **TV** (hoặc link tải TV riêng) rồi chép APK qua USB/Network → cài APK  
  (bản TV đã được thêm `LEANBACK_LAUNCHER` để hiện launcher trên TV)

---

## 3) iOS – Build & Upload TestFlight (macOS)

> iOS/TestFlight **bắt buộc** macOS + Xcode.

### 3.1 Yêu cầu

- macOS + **Xcode** (cài từ App Store)
- Tài khoản Apple Developer + App đã tạo trên **App Store Connect**
- App Store Connect **API Key**:
  - `ASC_API_KEY_ID`
  - `ASC_API_ISSUER_ID`
  - File `.p8` (khuyến nghị set đường dẫn)

### 3.2 Set biến môi trường

Ví dụ (macOS terminal):

```bash
export CAPACITOR_SERVER_URL="https://daop.pages.dev"
export CAPACITOR_APP_ID="com.daop.phim"          # bundle id phải khớp App Store Connect
export CAPACITOR_APP_NAME="DAOP Phim"

export ASC_API_KEY_ID="YOUR_KEY_ID"
export ASC_API_ISSUER_ID="YOUR_ISSUER_ID"
export ASC_API_KEY_P8_PATH="/full/path/AuthKey_XXXXX.p8"
```

Nếu build cần Team ID:

```bash
export IOS_DEVELOPMENT_TEAM="YOUR_TEAM_ID"
```

### 3.3 Chạy script build + upload TestFlight

```bash
cd /path/to/daop-movie
node app/build-ios-testflight.mjs --url "https://daop.pages.dev"
```

IPA sẽ được copy ra:
- `app/dist/ipa/`

TestFlight có thể mất vài phút để xử lý build sau khi upload.

---

## 4) Troubleshooting nhanh

### 4.1 `MODULE_NOT_FOUND build-android-phone-tv.mjs`

Bạn đang đứng sai thư mục. File nằm trong `app/`.

```powershell
cd "C:\Users\ADMIN\Desktop\DAOP\daop-movie\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev"
```

### 4.2 `npm error could not determine executable to run` khi `npx cap ...`

Thường do chưa `npm install` trong `app/`:

```powershell
cd .\app
npm install
npx cap add android
```

### 4.3 `JAVA_HOME is not set`

Set `JAVA_HOME` (xem mục 2.4).

### 4.4 `Unsupported class file major version 65`

Bạn đang dùng **JDK 21**. Hãy cài và chuyển sang **JDK 17** (xem mục 2.4.1 / 2.4.3).

### 4.5 GUI không chạy / không hiện log

Bạn luôn có thể build bằng lệnh (mục 2.5) để xem log đầy đủ trong terminal.

