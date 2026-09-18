"use client";

import { useEffect, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnOutline,
  adminBtnPrimary,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  confirmJournalRestore,
  fetchJournalBackups,
  requestJournalRestore,
  type JournalBackupRecord,
} from "@/lib/client/miniKbpServer";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function StaffBackupsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [rows, setRows] = useState<JournalBackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restoreFor, setRestoreFor] = useState<number | null>(null);
  const [pendingToken, setPendingToken] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  const reload = async () => {
    if (!session) return;
    setRows(await fetchJournalBackups(session));
    setLoading(false);
  };

  useEffect(() => {
    if (session?.role !== "admin") return;
    reload();
  }, [session]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(rows, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "backup_date") return row.backup_date.includes(val);
      if (col === "size") return formatBytes(row.compressed_bytes).toLowerCase().includes(val);
      if (col === "compression") return String(row.compression_ratio_pct).includes(val);
      if (col === "stats") {
        const stats = `оценки ${row.stats.grades ?? 0} дни ${row.stats.journal_days ?? 0}`;
        return stats.includes(val);
      }
      if (col === "created_at") {
        return new Date(row.created_at).toLocaleString("ru-RU").toLowerCase().includes(val);
      }
      return true;
    },
    sortCompare: (a, b) => b.backup_date.localeCompare(a.backup_date),
  });

  const startRestore = async (id: number) => {
    if (!session) return;
    setError("");
    setSuccess("");
    setBusy(true);
    const r = await requestJournalRestore(session, id);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setRestoreFor(id);
    setPendingToken(r.data.pending_token);
    setEmailCode("");
    setTotpCode("");
    setSuccess(`Код отправлен на ${r.data.email}${r.data.telegram_sent ? " и в Telegram" : ""}`);
  };

  const confirmRestore = async () => {
    if (!session || restoreFor == null || !pendingToken) return;
    setError("");
    setBusy(true);
    const r = await confirmJournalRestore(session, restoreFor, {
      pending_token: pendingToken,
      email_code: emailCode.trim(),
      totp_code: totpCode.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setRestoreFor(null);
    setPendingToken("");
    setSuccess(`Журнал восстановлен из бэкапа ${r.data.backup_date}`);
  };

  if (authLoading || loading) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Бэкапы журналов" />

      <AdminAlert error={error} success={success} />

      <AdminCard>
        <AdminTableWrap>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Размер</th>
              <th className="px-3 py-2">Сжатие</th>
              <th className="px-3 py-2">Записей</th>
              <th className="px-3 py-2">Создан</th>
              <th className="px-3 py-2" />
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "backup_date", label: "Дата" },
                { key: "size", label: "Размер" },
                { key: "compression", label: "Сжатие" },
                { key: "stats", label: "Записей" },
                { key: "created_at", label: "Создан" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={1}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  Бэкапов пока нет
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium">{row.backup_date}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {formatBytes(row.compressed_bytes)}
                    <span className="text-xs text-gray-400"> ({formatBytes(row.uncompressed_bytes)} до сжатия)</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.compression_ratio_pct}%</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    оценки {row.stats.grades ?? 0}, дни {row.stats.journal_days ?? 0}, опозд. {row.stats.lateness ?? 0}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(row.created_at).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className={adminBtnOutline}
                      disabled={busy}
                      onClick={() => void startRestore(row.id)}
                    >
                      Восстановить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableWrap>
        <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={20} onPageChange={setPage} />
      </AdminCard>

      {restoreFor != null ? (
        <AdminCard className="mt-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Подтверждение восстановления</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-xs text-gray-500">Код из письма</span>
              <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} className={`${adminInput} w-32`} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-gray-500">Код двухфакторной аутентификации</span>
              <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} className={`${adminInput} w-32`} />
            </label>
            <button type="button" className={adminBtnPrimary} disabled={busy} onClick={() => void confirmRestore()}>
              Подтвердить
            </button>
            <button type="button" className={adminBtnOutline} onClick={() => setRestoreFor(null)}>
              Отмена
            </button>
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}
