# Build App GoTV - Huong dan day du

Tai lieu nay huong dan tu A-Z de build app tu URL web bang bo `Build App GoTV`.

## Quick Start (5 phut) - Windows (Android Phone + TV)

### A) Cach nhanh bang lenh (CLI)

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
npm install
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "GoTV" --iconUrl "https://pub-62eef44669df48e4bca5388a38e69522.r2.dev/banners/1771769477571-2nqdpe9u.png"
```

Neu gap loi `npm.ps1 cannot be loaded...`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

> Luu y: Lan dau build co the mat 10-25 phut vi tai Gradle/dependencies.

## Tong quan

Bo nay su dung Capacitor de dong goi website thanh app:
- Android build ra 2 APK rieng: `phone` va `tv`
- App load web bang URL ban nhap (du lieu web thay doi theo thoi gian)
- Co the set ten app va icon URL khi build
- iOS TestFlight ho tro tren macOS

> Luu y: Tai lieu nay chi danh cho bo build app URL-only, khong bao gom phan admin/static web.

---

## 1) Cau truc thu muc

Gia su ban dang o thu muc:
- `C:\...\Build App GoTV`

Ben trong co:
- `app\` - source Capacitor + script build
- `BUILD_GUIDE.md` - tai lieu nay

---

## 2) Cai dat moi truong (Windows)

## 2.1 Cai Node.js

Tai Node LTS: [https://nodejs.org/en/download](https://nodejs.org/en/download)

Kiem tra:

```powershell
node -v
npm -v
```

## 2.2 Cai Android Studio + SDK

Tai Android Studio: [https://developer.android.com/studio](https://developer.android.com/studio)

Vao `SDK Manager`, cai toi thieu:
- Android SDK Platform (API 33/34)
- Android SDK Build-Tools
- Android SDK Platform-Tools

## 2.3 (Neu can) mo khoa PowerShell cho npm

Neu gap loi `npm.ps1 cannot be loaded...`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Neu khong muon doi policy, dung `cmd`:

```bat
npm.cmd install
npx.cmd cap sync android
```

## 2.4 Cai JDK 17

Khuyen nghi JDK 17 (on dinh voi Gradle hien tai).

Tai Temurin JDK 17: [https://adoptium.net/temurin/releases/?version=17](https://adoptium.net/temurin/releases/?version=17)

Kiem tra:

```powershell
java -version
```

Neu chua nhan java:

```powershell
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

---

## 3) Cai dependencies lan dau

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
npm install
```

---

## 4) Cach build bang lenh (CLI)

## 4.1 Build Android phone + tv (co ten app)

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "DAOP Phim"
```

## 4.2 Build Android + icon URL

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "DAOP Phim" --iconUrl "https://your-domain.com/icon.png"
```

## 4.3 Build chi voi URL (ten mac dinh)

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev"
```

## 4.4 Tao/mo native project tu URL (khong build APK)

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\create-app-from-url.mjs --platform android --url "https://daop.pages.dev"
```

## 4.5 Build release APK (de dung voi TWA verify domain)

### Tao keystore (1 lan)

```powershell
keytool -genkeypair -v -keystore ".\my-release-key.jks" -alias gotv -keyalg RSA -keysize 2048 -validity 10000
```

### Build release bang 1 lenh

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --release --url "https://daop.pages.dev" --appName "DAOP Phim" --storeFile "C:\path\to\my-release-key.jks" --storePassword "YOUR_STORE_PASSWORD" --keyAlias "gotv" --keyPassword "YOUR_KEY_PASSWORD"
```

> Lenh tren se build release cho ca `phone` va `tv`.

### Lay SHA256 certificate de tao assetlinks.json

```powershell
keytool -list -v -keystore "C:\path\to\my-release-key.jks" -alias "gotv"
```

Copy gia tri `SHA256:` de dua vao `assetlinks.json`.

---

## 6) iOS TestFlight (chi macOS)

## 6.1 Yeu cau
- macOS + Xcode
- Tai khoan Apple Developer
- Da tao app tren App Store Connect
- API key: `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, file `.p8`

## 6.2 Lenh build + upload

```bash
cd "<PATH_TO_BUILD_APP_GOTV>/app"
export ASC_API_KEY_ID="YOUR_KEY_ID"
export ASC_API_ISSUER_ID="YOUR_ISSUER_ID"
export ASC_API_KEY_P8_PATH="/full/path/AuthKey_XXXXX.p8"
node ./build-ios-testflight.mjs --url "https://daop.pages.dev"
```

File IPA (neu script copy ra):
- `app/dist/ipa/`

---

## 7) Lenh kiem tra nhanh sau khi build

## 7.1 Xem APK moi nhat

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
Get-ChildItem .\dist\apk\*.apk | Sort-Object LastWriteTime -Descending
```

## 7.2 Cai APK qua ADB (phone)

```powershell
adb devices
adb install -r ".\dist\apk\daop-phone-YYYY-MM-DDTHH-MM-SS-xxxZ.apk"
```

## 7.3 Cai APK qua ADB (tv)

```powershell
adb devices
adb install -r ".\dist\apk\daop-tv-YYYY-MM-DDTHH-MM-SS-xxxZ.apk"
```

---

## 8) Ghi chu ky thuat quan trong

- Ban `phone` co package: `com.daop.phim`
- Ban `tv` co package: `com.daop.phim.tv`
- Ban tv co `LEANBACK_LAUNCHER` de hien tren launcher TV
- Ban phone da bat TWA (Trusted Web Activity) de chay bang Chrome engine
- Ban tv van fallback WebView de dam bao tuong thich TV box
- De TWA khong hien thanh dia chi, can verify domain bang `assetlinks.json` + app release signing

## 8.1 Mau `assetlinks.json` cho TWA

Dat file tai: `https://YOUR_DOMAIN/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.daop.phim",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:...:ZZ"
      ]
    }
  }
]
```

Thay:
- `package_name` = package phone (`com.daop.phim`)
- `sha256_cert_fingerprints` = SHA256 lay tu keystore release

## 8.2 Tao nhanh assetlinks bang lenh (da lam san)

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\generate-assetlinks.mjs --package "com.daop.phim" --sha256 "AA:BB:CC:DD:...:ZZ"
```

Mac dinh file duoc ghi vao:
- `public/.well-known/assetlinks.json` (tu thu muc goc du an)

---

## 9) Loi thuong gap va cach sua

## 9.1 `MODULE_NOT_FOUND build-android-phone-tv.mjs`

Ban dang dung sai thu muc:

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev"
```

## 9.2 `JAVA_HOME is not set`

Set JDK:

```powershell
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

## 9.3 `Unsupported class file major version 65`

Ban dang dung JDK 21, chuyen sang JDK 17.

## 9.4 `npx`/`npm` bi chan boi policy

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Hoac dung `npm.cmd`, `npx.cmd`.

## 9.5 Khong thay log / chay lau

Hay chay lai bang CLI va doi (lan dau co the 10-25 phut):

```powershell
cd "<PATH_TO_BUILD_APP_GOTV>\app"
node .\build-android-phone-tv.mjs --url "https://daop.pages.dev" --appName "DAOP Phim" --iconUrl "https://your-domain.com/icon.png"
```

