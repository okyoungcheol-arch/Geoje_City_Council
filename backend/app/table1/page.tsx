// backend/app/table1/page.tsx
//
// 표1(회의 단위 평가표) / 표2(의원 상세) 실데이터 화면. design spec §4.1(2026-08-08
// 확정: 탭1 개요 + 탭2 축별 점수 분리 안)을 실제 statement_insights 데이터로 렌더링한다.
// 이전에는 web-demo/의 정적 파일럿 데이터로 프로토타입했으나, DB에 이미 실채점 데이터가
// 있어 그 데모는 제거하고 이 페이지로 대체했다.
import { getInsightRows } from "@/lib/queries/insights";
import { Table1Client } from "./Table1Client";

export const dynamic = "force-dynamic";

export default async function Table1Page() {
  const rows = await getInsightRows();
  return <Table1Client rows={rows} />;
}
