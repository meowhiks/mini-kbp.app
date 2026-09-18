"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { staffNavHref } from "@/lib/client/hostRouting";

type StaffLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function StaffLink({ href, ...props }: StaffLinkProps) {
  const pathname = usePathname();
  return <Link href={staffNavHref(href, pathname)} {...props} />;
}
