"use client";

import AuthBrandWatermark from "./AuthBrandWatermark";
import AuthFlowShader from "./AuthFlowShader";

/** Фон auth-страниц: шейдер + водяной знак. */
export default function AuthSceneBackdrop() {
  return (
    <>
      <AuthFlowShader />
      <AuthBrandWatermark />
    </>
  );
}
