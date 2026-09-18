import type { ReactNode } from "react";
import AuthSceneBackdrop from "./AuthSceneBackdrop";

type Props = {
  title: string;
  children: ReactNode;
};

/** Минимальная страница входа в браузере: только провайдер, без ЛК. */
export default function AuthIsland({ title, children }: Props) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f0f4fa] px-6 py-10">
      <AuthSceneBackdrop />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white/90 px-6 py-8 text-center shadow-sm backdrop-blur-[2px]">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}
