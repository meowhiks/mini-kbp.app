/** Иконки OAuth-кнопок. */

/** Официальный контур самолётика Telegram (512×512). */
export const TELEGRAM_PLANE_PATH =
  "M470.4354553,45.4225006L16.8273029,221.2490387c-18.253809,8.1874695-24.4278889,24.5854034-4.4127407,33.4840851l116.3710175,37.1726685l281.3674316-174.789505c15.3625488-10.9733887,31.0910339-8.0470886,17.5573425,4.023468L186.0532227,341.074646l-7.5913849,93.0762329c7.0313721,14.3716125,19.9055786,14.4378967,28.1172485,7.2952881l66.8582916-63.5891418l114.5050659,86.1867065c26.5942688,15.8265076,41.0652466,5.6130371,46.7870789-23.3935242L509.835083,83.1804428C517.6329956,47.474514,504.3345032,31.7425518,470.4354553,45.4225006z";

export function TelegramIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="#229ED9"
      aria-hidden
    >
      <path d={TELEGRAM_PLANE_PATH} />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GlobeIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#3390ec" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function QrCodeIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path strokeLinecap="round" d="M14 14h2v2h-2zM18 14h3v3h-3zM14 18h2v3h-2zM18 21h3" />
    </svg>
  );
}
