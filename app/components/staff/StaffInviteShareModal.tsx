"use client";

import { useMemo } from "react";
import ProfileQrCode from "@/app/components/app/ProfileQrCode";
import { buildRoleInviteUrl } from "@/lib/client/roleInviteLink";
import { adminBtnOutline, adminBtnPrimary } from "@/app/components/staff/AdminShell";

type StaffInviteShareModalProps = {
  code: string;
  groupName?: string | null;
  maxUses?: number;
  onClose: () => void;
};

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

export default function StaffInviteShareModal({
  code,
  groupName,
  maxUses,
  onClose,
}: StaffInviteShareModalProps) {
  const inviteUrl = useMemo(() => buildRoleInviteUrl(code), [code]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-share-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="invite-share-title" className="text-base font-semibold text-gray-900">
          Приглашение в группу
        </h2>
        {groupName ? (
          <p className="mt-1 text-sm text-gray-500">
            {groupName}
            {maxUses && maxUses > 1 ? ` · до ${maxUses} человек` : null}
          </p>
        ) : null}

        <div className="mx-auto mt-4 flex w-[200px] justify-center rounded-xl border border-gray-100 bg-white p-3">
          <ProfileQrCode value={inviteUrl} size={176} />
        </div>

        <p className="mt-3 break-all text-center font-mono text-sm tracking-wider text-gray-800">{code}</p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-gray-500">Ссылка-приглашение</span>
          <input
            readOnly
            value={inviteUrl}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700"
            onFocus={(e) => e.target.select()}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminBtnOutline}
            onClick={() => copyText(code)}
          >
            Код
          </button>
          <button
            type="button"
            className={adminBtnPrimary}
            onClick={() => copyText(inviteUrl)}
          >
            Ссылка
          </button>
          <button type="button" className={`${adminBtnOutline} ml-auto`} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
