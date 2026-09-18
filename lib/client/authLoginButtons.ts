/** Какие кнопки входа показывать. Capacitor — как ПК: Google + Telegram (через системный браузер). */

export type AuthLoginButtons = {
  qrLogin: boolean;
  qrScan: boolean;
  telegram: boolean;
  google: boolean;
  siteNative: boolean;
};

export function authLoginButtons(opts: {
  native: boolean;
  electron: boolean;
  desktopBrowser: boolean;
}): AuthLoginButtons {
  if (opts.native) {
    return {
      qrLogin: false,
      qrScan: false,
      telegram: true,
      google: true,
      siteNative: false,
    };
  }
  return {
    qrLogin: opts.desktopBrowser,
    qrScan: false,
    telegram: true,
    google: true,
    siteNative: false,
  };
}
