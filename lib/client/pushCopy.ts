export function gradePushCopy(subject: string, marks: string): { title: string; body: string } {
  const title = (subject || "Предмет").trim() || "Предмет";
  const value = (marks || "").trim() || "—";
  return { title, body: `У вас новые отметки : ${value}` };
}

export function replacementPushCopy(
  pairNumber: number,
  replacementName: string,
  originalName: string
): { title: string; body: string } {
  const n = Number.isFinite(pairNumber) ? pairNumber : 0;
  const neu = (replacementName || "Замена").trim() || "Замена";
  const alt = (originalName || "занятие").trim() || "занятие";
  return { title: `Замена ${n} урока!`, body: `${neu} вместо ${alt}` };
}
