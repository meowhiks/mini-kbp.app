"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchReplacementBatch,
  fetchReplacementBatches,
  importReplacementOcrJson,
  publishReplacementBatch,
  unpublishReplacementBatch,
  updateReplacementBatch,
  type ReplacementBatchRecord,
  type ReplacementEntryRecord,
  type ReplacementEventType,
} from "@/lib/client/miniKbpServer";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnDanger,
  adminBtnOutline,
  adminBtnPrimary,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { REPLACEMENT_OCR_PROMPT } from "@/lib/client/replacementOcrPrompt";

const EVENT_LABELS: Record<ReplacementEventType, string> = {
  NEW_LESSON: "Новый урок",
  CANCELLATION: "Урок снят",
  REPLACEMENT: "Замена",
};

function emptyBlock() {
  return { subject: "", room: "", teachers: "" };
}

function entryToForm(e: ReplacementEntryRecord) {
  return {
    group_code: e.group_code || "",
    lesson_number: String(e.lesson_number || ""),
    event_type: e.event_type,
    repl: {
      subject: e.replacement_data?.subject || "",
      room: e.replacement_data?.room || "",
      teachers: (e.replacement_data?.teachers || []).join(", "),
    },
    orig: {
      subject: e.original_data?.subject || "",
      room: e.original_data?.room || "",
      teachers: (e.original_data?.teachers || []).join(", "),
    },
  };
}

type FormRow = ReturnType<typeof entryToForm>;

function formToEntry(row: FormRow): ReplacementEntryRecord {
  const splitTeachers = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    group_code: row.group_code.trim(),
    lesson_number: Number.parseInt(row.lesson_number, 10) || 0,
    event_type: row.event_type,
    replacement_data: {
      subject: row.repl.subject.trim() || null,
      room: row.repl.room.trim() || null,
      teachers: splitTeachers(row.repl.teachers),
    },
    original_data: {
      subject: row.orig.subject.trim() || null,
      room: row.orig.room.trim() || null,
      teachers: splitTeachers(row.orig.teachers),
    },
  };
}

function stripJsonFence(raw: string): string {
  const s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fence ? fence[1].trim() : s;
}

export default function StaffReplacementsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [batches, setBatches] = useState<ReplacementBatchRecord[]>([]);
  const [active, setActive] = useState<ReplacementBatchRecord | null>(null);
  const [rows, setRows] = useState<FormRow[]>([]);
  const [date, setDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [pasteJson, setPasteJson] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const reloadList = useCallback(async () => {
    if (!session) return;
    setBatches(await fetchReplacementBatches(session));
  }, [session]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    void reloadList();
  }, [session, reloadList]);

  const openBatch = async (id: number) => {
    if (!session) return;
    setError("");
    const r = await fetchReplacementBatch(session, id);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setActive(r.data);
    setDate(r.data.date || "");
    setDayOfWeek(r.data.day_of_week || "");
    setSignedBy(r.data.signed_by || "");
    setRows((r.data.entries || []).map(entryToForm));
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(REPLACEMENT_OCR_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать промпт");
    }
  };

  const importPaste = async () => {
    if (!session) return;
    setError("");
    setSuccess("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(pasteJson));
    } catch {
      setError("Невалидный JSON — вставьте ответ ИИ целиком");
      return;
    }
    setBusy(true);
    const r = await importReplacementOcrJson(session, parsed);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setPasteJson("");
    setSuccess(`Черновик #${r.data.id} создан — проверьте строки и опубликуйте`);
    await reloadList();
    await openBatch(r.data.id);
  };

  const saveDraft = async () => {
    if (!session || !active) return;
    setBusy(true);
    setError("");
    const r = await updateReplacementBatch(session, active.id, {
      date: date || null,
      day_of_week: dayOfWeek,
      signed_by: signedBy,
      entries: rows.map(formToEntry),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Сохранено");
    setActive(r.data);
    setRows((r.data.entries || []).map(entryToForm));
    await reloadList();
  };

  const publish = async () => {
    if (!session || !active) return;
    setBusy(true);
    setError("");
    await saveDraft();
    const r = await publishReplacementBatch(session, active.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Опубликовано — overlay и push отправлены");
    setActive(r.data);
    await reloadList();
  };

  const unpublish = async () => {
    if (!session || !active) return;
    if (!window.confirm("Снять пакет с публикации? Замены пропадут из расписания.")) {
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const r = await unpublishReplacementBatch(session, active.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Публикация отменена — пакет снова черновик");
    setActive(r.data);
    await reloadList();
  };

  if (authLoading || !session) {
    return <div className="p-6 text-sm text-gray-500">Загрузка…</div>;
  }
  if (session.role !== "admin") {
    return <AdminAlert error="Доступ только администратору" />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Замены расписания"
      />
      {error ? <AdminAlert error={error} /> : null}
      {success ? <AdminAlert success={success} /> : null}

      <AdminCard>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">1. Промпт для ИИ</h2>
        <pre className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap">
          {REPLACEMENT_OCR_PROMPT}
        </pre>
        <button type="button" className={`${adminBtnPrimary} mt-3`} onClick={() => void copyPrompt()}>
          {promptCopied ? "Скопировано" : "Копировать промпт"}
        </button>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">2. Вставить JSON от ИИ</h2>
        <textarea
          className={`${adminInput} min-h-[10rem] font-mono text-xs`}
          placeholder='{"schedule_info":{...},"replacements":[...]}'
          value={pasteJson}
          onChange={(e) => setPasteJson(e.target.value)}
        />
        <button
          type="button"
          className={`${adminBtnPrimary} mt-3`}
          disabled={busy || !pasteJson.trim()}
          onClick={() => void importPaste()}
        >
          Создать черновик
        </button>
      </AdminCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Пакеты</h2>
          <AdminTableWrap>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-2 py-1">ID</th>
                  <th className="px-2 py-1">Дата</th>
                  <th className="px-2 py-1">Статус</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${
                      active?.id === b.id ? "bg-amber-50" : ""
                    }`}
                    onClick={() => void openBatch(b.id)}
                  >
                    <td className="px-2 py-2">#{b.id}</td>
                    <td className="px-2 py-2">{b.date || "—"}</td>
                    <td className="px-2 py-2">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminCard>

        <AdminCard>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {active ? `Пакет #${active.id}` : "Выберите пакет"}
          </h2>
          {active ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-500">
                  Дата
                  <input className={adminInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="text-xs text-gray-500">
                  День
                  <input
                    className={adminInput}
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Подпись
                  <input className={adminInput} value={signedBy} onChange={(e) => setSignedBy(e.target.value)} />
                </label>
              </div>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto">
                {rows.map((row, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        className={adminInput}
                        placeholder="Группа"
                        value={row.group_code}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, group_code: e.target.value };
                          setRows(next);
                        }}
                      />
                      <input
                        className={adminInput}
                        placeholder="№"
                        value={row.lesson_number}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...row, lesson_number: e.target.value };
                          setRows(next);
                        }}
                      />
                      <select
                        className={adminInput}
                        value={row.event_type}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = {
                            ...row,
                            event_type: e.target.value as ReplacementEventType,
                          };
                          setRows(next);
                        }}
                      >
                        {(Object.keys(EVENT_LABELS) as ReplacementEventType[]).map((k) => (
                          <option key={k} value={k}>
                            {EVENT_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-gray-500">Новое</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["subject", "room", "teachers"] as const).map((field) => (
                        <input
                          key={field}
                          className={adminInput}
                          placeholder={field}
                          value={row.repl[field]}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = {
                              ...row,
                              repl: { ...row.repl, [field]: e.target.value },
                            };
                            setRows(next);
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-gray-500">Было</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["subject", "room", "teachers"] as const).map((field) => (
                        <input
                          key={field}
                          className={adminInput}
                          placeholder={field}
                          value={row.orig[field]}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = {
                              ...row,
                              orig: { ...row.orig, [field]: e.target.value },
                            };
                            setRows(next);
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-xs text-red-600"
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                    >
                      Удалить строку
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className={adminBtnOutline}
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      group_code: "",
                      lesson_number: "",
                      event_type: "REPLACEMENT",
                      repl: emptyBlock(),
                      orig: emptyBlock(),
                    },
                  ])
                }
              >
                + Строка
              </button>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className={adminBtnOutline}
                  disabled={busy || active.status === "published"}
                  onClick={() => void saveDraft()}
                >
                  Сохранить
                </button>
                {active.status === "published" ? (
                  <button
                    type="button"
                    className={adminBtnDanger}
                    disabled={busy}
                    onClick={() => void unpublish()}
                  >
                    Отменить публикацию
                  </button>
                ) : (
                  <button
                    type="button"
                    className={adminBtnPrimary}
                    disabled={busy}
                    onClick={() => void publish()}
                  >
                    Опубликовать
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Импортируйте JSON сверху или выберите пакет слева.</p>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
