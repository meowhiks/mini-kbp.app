/** Парсер HTML расписания kbp.by (порт логики из lib/client/kbpApi.ts) */

const WEEK_DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

export function parseTimetableHtml(html, groupId, groupName) {
  const data = {
    groupId,
    groupName,
    pairs: [],
    dayReplacementStatus: Array.from({ length: 6 }, () => ({
      label: "",
      hasChanges: false,
      noChanges: false,
      unknown: true,
    })),
  };

  const extractWeekBlock = (weekId) => {
    if (weekId === "left_week") {
      return html.match(/<div[^>]*id=["']left_week["'][^>]*>([\s\S]*?)<div[^>]*id=["']right_week["']/i)?.[1] ?? null;
    }
    return html.match(/<div[^>]*id=["']right_week["'][^>]*>([\s\S]*)/i)?.[1] ?? null;
  };

  const extractScheduleTable = (weekBlock) => {
    const m = weekBlock.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    const content = m?.[1];
    return content && (content.includes("pair-number") || content.includes('day="')) ? content : null;
  };

  const parseZamenaForDays = (tableContent, dayIndices) => {
    const replacementRowMatch = tableContent.match(/<tr[^>]*class="[^"]*zamena[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (!replacementRowMatch) return;
    const replacementCells = Array.from(replacementRowMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
    for (let i = 0; i < dayIndices.length; i++) {
      const storeIndex = dayIndices[i];
      const cellContent = replacementCells[i + 1]?.[1] || "";
      const plain = cellContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const hasChanges = /показать\s+замены/i.test(plain);
      const noChanges = /нету?\s+замен/i.test(plain);
      if (!data.dayReplacementStatus[storeIndex]) {
        data.dayReplacementStatus[storeIndex] = { label: "", hasChanges: false, noChanges: false, unknown: true };
      }
      data.dayReplacementStatus[storeIndex] = {
        label: plain,
        hasChanges,
        noChanges,
        unknown: !hasChanges && !noChanges,
      };
    }
  };

  const segments = [];
  const leftBlock = extractWeekBlock("left_week");
  const rightBlock = extractWeekBlock("right_week");

  if (leftBlock) {
    const leftTable = extractScheduleTable(leftBlock);
    if (leftTable) {
      segments.push({ content: leftTable, weekOffset: 0 });
      parseZamenaForDays(leftTable, [0, 1, 2, 3, 4, 5]);
    }
  }

  if (rightBlock) {
    const rightTable = extractScheduleTable(rightBlock);
    if (rightTable) {
      segments.push({ content: rightTable, weekOffset: 1 });
      data.hasNextWeekMonday = true;
      data.dayReplacementStatus.push({ label: "", hasChanges: false, noChanges: false, unknown: true });
      parseZamenaForDays(rightTable, [6]);
    }
  }

  for (const seg of segments) {
    parsePairsFromTable(seg.content, seg.weekOffset, data);
  }

  return data;
}

function parsePairsFromTable(tableContent, weekOffset, data) {
  const rowMatches = Array.from(tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g));
  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1];
    const pairNumberMatch = rowContent.match(/<td[^>]*class="[^"]*number[^"]*"[^>]*>(\d+)<\/td>/);
    if (!pairNumberMatch) continue;
    const pairNumber = parseInt(pairNumberMatch[1], 10);

    const dayCells = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g));
    if (dayCells.length < 8) continue;

    for (let cellIndex = 1; cellIndex < dayCells.length - 1; cellIndex++) {
      const cellContent = dayCells[cellIndex][1];
      let dayIndex = null;
      const dayCommentMatch = cellContent.match(/<!--[^>]*day="(\d+)"[^>]*-->/);
      if (dayCommentMatch) {
        const dayFromComment = parseInt(dayCommentMatch[1], 10);
        if (dayFromComment >= 1 && dayFromComment <= 6) dayIndex = dayFromComment - 1;
      }
      if (dayIndex === null) {
        dayIndex = cellIndex - 1;
        if (dayIndex < 0 || dayIndex > 5) continue;
      }
      if (weekOffset === 1 && dayIndex !== 0) continue;
      if (cellContent.includes("empty-pair") && !cellContent.includes("pair")) continue;

      extractPairsInCell(cellContent, pairNumber, dayIndex, weekOffset, data);
    }
  }
}

function extractPairsInCell(cellContent, pairNumber, dayIndex, weekOffset, data) {
  let pairStartIndex = 0;
  let iterations = 0;
  while (pairStartIndex < cellContent.length && iterations < 100) {
    iterations++;
    const pairStartMatch = cellContent.substring(pairStartIndex).match(/<div[^>]*class="([^"]*)"[^>]*>/i);
    if (!pairStartMatch) break;
    const pairStartPos = pairStartIndex + (pairStartMatch.index || 0);
    const pairClasses = pairStartMatch[1] || "";
    const pairTagStart = pairStartPos + pairStartMatch[0].length;
    if (!pairClasses.includes("pair")) {
      pairStartIndex = pairTagStart + 1;
      continue;
    }

    const pairEndPos = findClosingDiv(cellContent, pairTagStart);
    if (pairEndPos === -1) {
      pairStartIndex = pairTagStart + 1;
      continue;
    }

    const pairContent = cellContent.substring(pairTagStart, pairEndPos);
    const pairData = {
      pairNumber,
      day: dayIndex,
      dayName: WEEK_DAYS[dayIndex],
      subject: "",
      teacher: "",
      room: "",
      status: "normal",
      weekOffset,
    };

    const subjectMatch = pairContent.match(
      /<div[^>]*class="[^"]*subject[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i
    );
    if (subjectMatch) pairData.subject = subjectMatch[1].trim();

    const teacherMatch = pairContent.match(/<div[^>]*class="[^"]*teacher[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    if (teacherMatch) pairData.teacher = teacherMatch[1].trim();

    const roomMatch = pairContent.match(/<div[^>]*class="[^"]*place[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    if (roomMatch) pairData.room = roomMatch[1].trim();

    if (pairClasses.includes("added")) pairData.status = "added";
    else if (pairClasses.includes("replaced")) pairData.status = "replaced";
    else if (pairClasses.includes("removed")) pairData.status = "removed";
    else if (pairClasses.includes("cancelled")) pairData.status = "cancelled";

    if (pairData.subject) data.pairs.push(pairData);
    pairStartIndex = pairEndPos + 6;
  }
}

function findClosingDiv(content, startPos) {
  let depth = 1;
  let pos = startPos;
  let iterations = 0;
  while (pos < content.length && depth > 0 && iterations < 1000) {
    iterations++;
    const nextDivOpen = content.indexOf("<div", pos);
    const nextDivClose = content.indexOf("</div>", pos);
    if (nextDivClose === -1) break;
    if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
      depth++;
      pos = nextDivOpen + 4;
    } else {
      depth--;
      if (depth === 0) return nextDivClose;
      pos = nextDivClose + 6;
    }
  }
  return -1;
}
