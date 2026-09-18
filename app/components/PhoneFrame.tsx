import Image from "next/image";
import type { ReactNode } from "react";

type PhoneFrameProps = {
  children: ReactNode;
  className?: string;
  label?: string;
  variant?: "default" | "journal";
};

export default function PhoneFrame({
  children,
  className = "",
  label = "Мини КБиП",
  variant = "default",
}: PhoneFrameProps) {
  return (
    <div
      className={`iphone-mockup ${variant === "journal" ? "iphone-mockup--journal" : ""} ${className}`}
    >
      <div className="iphone-mockup__screen">{children}</div>
      <Image
        src="/iphone-frame.svg"
        alt=""
        width={390}
        height={844}
        className="iphone-mockup__frame"
        priority
        aria-hidden
      />
      {label ? <p className="iphone-mockup__caption">{label}</p> : null}
    </div>
  );
}
