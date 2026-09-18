import type { CapacitorConfig } from "@capacitor/cli";

/** Задаётся только для live reload: CAP_SERVER_URL=http://192.168.x.x:3000 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.kbp.journal",
  appName: "Мини КБиП Расписание",
  webDir: "out",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        }
      : {}),
  },
  plugins: {
    NotificationPlugin: {},
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
