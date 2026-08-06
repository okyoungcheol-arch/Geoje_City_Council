// backend/scripts/scrape/meetingList.ts
import type { CouncilSession } from "./session";
import { postAsync } from "./session";

export interface CouncilCategory {
  cmtCd: string;
  label: string;
}

interface CommitteeRootRow {
  text: string;
  data: { cl_cd: string; cmt_cd: string };
}
interface SessionRow {
  text: string;
  data: { cl_cd: string; cmt_cd: string; th: number; session: number };
}
interface MinutesRow {
  text: string;
  a_attr: { title: string };
  data: { uid: number; publish: string };
}

export interface ScrapedMeeting {
  sourceMeetingId: string;
  category: string;
  title: string;
  sessionRound: string;
  sessionNo: string;
  meetingDate: string | null;
  sourceUrl: string;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// "제264회 [임시회] (2026. 07. 20. ~ 2026. 07. 31.)" -> "제264회"
export function parseSessionRound(label: string): string {
  const match = label.match(/^(제\d+회)/);
  return match ? match[1] : label;
}

// "[임시회의록] 제1차(2026.07.20.월요일)" -> { sessionNo: "제1차", meetingDate: "2026-07-20" }
export function parseDocumentLabel(label: string): { sessionNo: string; meetingDate: string | null } {
  const noMatch = label.match(/(제\d+차|개회식)/);
  const sessionNo = noMatch ? noMatch[1] : label;
  const dateMatch = label.match(/(\d{4})[.\s]+(\d{2})[.\s]+(\d{2})/);
  const meetingDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  return { sessionNo, meetingDate };
}

export async function scrapeCategories(session: CouncilSession): Promise<CouncilCategory[]> {
  const rows = await postAsync<CommitteeRootRow[]>(session, "committeeRoot.do", { cl_cd: "CT" });
  return rows.map((r) => ({ cmtCd: r.data.cmt_cd, label: r.text }));
}

export async function scrapeMeetingList(session: CouncilSession, category: CouncilCategory): Promise<ScrapedMeeting[]> {
  const sessionRows = await postAsync<SessionRow[]>(session, "session.do", {
    cl_cd: "CT",
    th: 10,
    cmt_cd: category.cmtCd,
  });

  const meetings: ScrapedMeeting[] = [];
  for (const sessionRow of sessionRows) {
    await sleep(500); // polite delay between the tree API's own child requests

    const documentRows = await postAsync<MinutesRow[]>(session, "minutes.do", {
      cl_cd: "CT",
      th: 10,
      session: sessionRow.data.session,
      cmt_cd: category.cmtCd,
    });

    for (const doc of documentRows) {
      if (doc.data.publish !== "T") continue; // skip unpublished/provisional-only placeholders

      const { sessionNo, meetingDate } = parseDocumentLabel(doc.text);
      meetings.push({
        sourceMeetingId: String(doc.data.uid),
        category: category.label,
        title: doc.a_attr.title,
        sessionRound: parseSessionRound(sessionRow.text),
        sessionNo,
        meetingDate,
        sourceUrl: `https://www.gjcl.go.kr/viewer/minutes.do?uid=${doc.data.uid}`,
      });
    }
  }
  return meetings;
}
