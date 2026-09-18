export function inviteStepCopy(): { title: string; body: string; placeholder: string } {
  return {
    title: "Вход по приглашению",
    body: "Нужен код приглашения, который выдал куратор или администратор. Без этого кода новый аккаунт не привяжется к группе.",
    placeholder: "Код приглашения",
  };
}
