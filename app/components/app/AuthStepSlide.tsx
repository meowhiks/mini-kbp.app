"use client";

import type { ReactNode } from "react";

type AuthStepSlideProps = {
  stepKey: string;
  direction: 1 | -1;
  children: ReactNode;
};

/** Горизонтальный переход между шагами входа (только Android / native). */
export default function AuthStepSlide({ children }: AuthStepSlideProps) {
  return <div className="auth-step-shell w-full">{children}</div>;
}
