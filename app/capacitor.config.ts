import { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const appId = process.env.CAPACITOR_APP_ID?.trim() || 'com.daop.phim';
const appName = process.env.CAPACITOR_APP_NAME?.trim() || 'DAOP Phim';

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: '../public',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
        androidScheme: 'https',
      }
    : {
        androidScheme: 'https',
      },
};

export default config;
