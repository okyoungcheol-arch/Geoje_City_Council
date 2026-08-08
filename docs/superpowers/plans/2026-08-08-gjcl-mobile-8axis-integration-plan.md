# 모바일 앱 8축 실데이터 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mobile/`이 백엔드가 실제로 내려주는 8축 실데이터(`/api/insights`)를 정확한 타입으로 받아, 이미 만들어진 8축 UI(`OverviewTab`/`ScoreGridTab`)로 표1/표2를 렌더링하도록 통합하고, 5축 잔재와 목업 전용 프로토타입 경로를 제거한다.

**Architecture:** `mobile/src/lib/axes.ts`(신규, 축/발언유형 표시 상수 — 백엔드 `weightedAverage.ts`/`Table1Client.tsx`의 값을 복제)를 기반으로 `mobile/src/lib/api.ts`의 `InsightRow`를 8축 스키마로 교체하고, `components/table1/*`(이미 8축 UI로 존재)를 그 타입으로 재배선한 뒤 홈 화면(`app/index.tsx`)에 편입시킨다. 마지막에 5축 잔재(`InsightCard.tsx`)와 목업 전용 프로토타입 라우트(`app/prototype/table1/*`, `lib/pilotSampleData.ts`)를 삭제한다.

**Tech Stack:** React Native 0.86 + Expo ~57 (Expo Router, 파일 기반 라우팅), TypeScript strict mode, `fetch()` 기반 REST 클라이언트. 모바일 프로젝트에는 테스트 러너(Jest 등)가 구성되어 있지 않다 — 이 계획의 검증 게이트는 `npx tsc --noEmit`(타입 정합성)과 마지막 태스크의 수동 `expo start --web` 스모크 테스트다. 이번 작업 범위에서 새 테스트 프레임워크를 도입하지 않는다.

## Global Constraints

- 대상 범위는 제10대만 (스크래핑/DB 관련 — 이번 모바일 전용 작업과는 무관하지만 프로젝트 전역 제약이므로 참고).
- 영상 기능 전면 금지 — 이번 작업에서 어떤 형태로도 영상 URL/타임코드/플레이어를 추가하지 않는다.
- 모든 색상·폰트·spacing·radius는 `mobile/src/theme/tokens.ts`의 `colors`/`typography`/`spacing`/`radius`를 통해서만 사용한다. 새 hex 값을 하드코딩하지 않는다 (기존 컴포넌트들도 전부 이 규칙을 따르고 있음 — 그대로 유지).
- `mobile/`은 `backend/`의 코드를 import하지 않는다 — 오직 HTTP(`fetch`)로만 통신한다. `axes.ts`는 백엔드 상수를 **복제**하는 것이지 import가 아니다.
- 평점 척도는 정수 1~5 (`creativity`가 `null`인 경우는 예외 — 해당 발언유형에서 가중치 자체가 "―(제외)"라 채점되지 않음. `persistence`가 `null`인 경우도 예외 — `pending_future_evaluation`).
- 가중평균은 모바일에서 재계산하지 않는다 — 항상 서버가 계산해 내려준 `weightedScore`를 그대로 표시한다.
- 회의록에 없는 사실을 지어내지 않는다 (표시 로직에서 데이터가 없으면 "없음"/"―" 등으로 명시하고 임의 채움 금지 — 기존 `statement/[id].tsx`, `prototype/table1/member/[name].tsx`가 이미 지키고 있는 원칙, 계속 유지).

**참고 파일 (읽기 전용, 값 출처):**
- `backend/lib/scoring/weightedAverage.ts` — `AXES`, `AXIS_WEIGHTS` 값의 원본.
- `backend/app/table1/Table1Client.tsx` — `AXIS_LABELS`, `SPEECH_TYPE_LABELS`, `weightFootnote()`, 주제 대체값 규칙의 원본.
- `backend/lib/queries/insights.ts` — `InsightRow`(백엔드) 필드명·nullability의 원본. 모바일 `InsightRow`는 이 인터페이스와 필드명이 정확히 일치해야 한다.
- `backend/lib/ai/summarize.ts:8-9` — `SpeechType` 유니온 값(`"five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"`)의 원본.

---

### Task 1: 축/발언유형 표시 상수 (`mobile/src/lib/axes.ts`)

**Files:**
- Create: `mobile/src/lib/axes.ts`

**Interfaces:**
- Produces:
  - `export type Axis = "creativity" | "feasibility" | "evidenceLegal" | "persistence" | "oversight" | "citizenBenefit" | "futureStrategy" | "cityDevelopment"`
  - `export type SpeechType = "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal"`
  - `export const AXES: Axis[]` (순서 고정, 위 8개)
  - `export const AXIS_LABELS: Record<Axis, string>`
  - `export const AXIS_WEIGHTS: Record<SpeechType, Record<Axis, number | null>>`
  - `export const SPEECH_TYPE_LABELS: Record<SpeechType, string>`
  - `export function weightFootnote(speechTypesUsed: SpeechType[]): string`
  - `export function axisCellLabel(value: number | null, axis: Axis, persistenceStatus: string): string`

- [ ] **Step 1: 파일 작성**

```ts
// mobile/src/lib/axes.ts
//
// backend/lib/scoring/weightedAverage.ts + backend/app/table1/Table1Client.tsx의
// 표시용 상수를 값 그대로 복제한 파일이다. mobile은 backend 코드를 import하지 않으므로
// (CLAUDE.md 제약) 여기서 값을 직접 유지한다 — 백엔드 가중치표가 바뀌면 이 파일도
// 함께 갱신해야 한다. 가중평균 자체는 여기서 재계산하지 않는다.

export type Axis =
  | "creativity"
  | "feasibility"
  | "evidenceLegal"
  | "persistence"
  | "oversight"
  | "citizenBenefit"
  | "futureStrategy"
  | "cityDevelopment";

export const AXES: Axis[] = [
  "creativity",
  "feasibility",
  "evidenceLegal",
  "persistence",
  "oversight",
  "citizenBenefit",
  "futureStrategy",
  "cityDevelopment",
];

export const AXIS_LABELS: Record<Axis, string> = {
  creativity: "창의성",
  feasibility: "실현가능성",
  evidenceLegal: "근거·법적",
  persistence: "지속성",
  oversight: "견제력",
  citizenBenefit: "시민체감",
  futureStrategy: "미래전략",
  cityDevelopment: "거제발전",
};

export type SpeechType = "five_min" | "budget_review" | "admin_audit" | "ordinance_proposal";

export const SPEECH_TYPE_LABELS: Record<SpeechType, string> = {
  five_min: "5분 이상 발언",
  budget_review: "예산·결산 심의",
  admin_audit: "행정사무감사",
  ordinance_proposal: "조례 발안 설명",
};

export const AXIS_WEIGHTS: Record<SpeechType, Record<Axis, number | null>> = {
  five_min: {
    creativity: 1.5,
    feasibility: 1.5,
    evidenceLegal: 1.5,
    persistence: 1.0,
    oversight: 0.5,
    citizenBenefit: 1.5,
    futureStrategy: 1.5,
    cityDevelopment: 1.0,
  },
  budget_review: {
    creativity: null,
    feasibility: 1.0,
    evidenceLegal: 2.0,
    persistence: 2.0,
    oversight: 2.0,
    citizenBenefit: 1.0,
    futureStrategy: 1.0,
    cityDevelopment: 0.5,
  },
  admin_audit: {
    creativity: 0.5,
    feasibility: 1.0,
    evidenceLegal: 2.0,
    persistence: 2.5,
    oversight: 2.5,
    citizenBenefit: 1.0,
    futureStrategy: 1.0,
    cityDevelopment: 0.5,
  },
  ordinance_proposal: {
    creativity: 1.5,
    feasibility: 2.0,
    evidenceLegal: 2.0,
    persistence: 2.0,
    oversight: 0.5,
    citizenBenefit: 1.5,
    futureStrategy: 1.5,
    cityDevelopment: 1.0,
  },
};

/** backend/app/table1/Table1Client.tsx의 weightFootnote()와 동일한 규칙. */
export function weightFootnote(speechTypesUsed: SpeechType[]): string {
  return speechTypesUsed
    .map((st) => {
      const weights = AXIS_WEIGHTS[st];
      const parts = AXES.map((a) => `${AXIS_LABELS[a]} ${weights[a] === null ? "―(제외)" : weights[a]}`);
      return `[${SPEECH_TYPE_LABELS[st] ?? st}] ${parts.join(" · ")}`;
    })
    .join("\n");
}

/** 지속성 N/A("향후평가")와 일반 숫자 점수를 하나의 셀 표시 문자열로 통일한다. */
export function axisCellLabel(value: number | null, axis: Axis, persistenceStatus: string): string {
  if (axis === "persistence" && persistenceStatus === "pending_future_evaluation") return "향후평가";
  return value === null ? "―" : String(value);
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd mobile && npx tsc --noEmit`
Expected: 이 파일 자체는 새 파일이라 다른 파일에 영향 없음 — 기존 에러(있었다면)만 그대로, 새 에러 없음.

- [ ] **Step 3: 커밋**

```bash
cd mobile
git add src/lib/axes.ts
git commit -m "feat(mobile): add shared 8-axis/speech-type display constants"
```

---

### Task 2: 데이터 레이어 8축 전환 (`mobile/src/lib/api.ts`)

**Files:**
- Modify: `mobile/src/lib/api.ts`

**Interfaces:**
- Consumes: `Axis`, `SpeechType` from `@/lib/axes` (Task 1)
- Produces:
  - `export interface InsightRow { statementId: number; meetingTitle: string; memberName: string; tags: string[]; topicsToWatch: string[]; speechType: string; creativity: number | null; feasibility: number; evidenceLegal: number; persistence: number | null; persistenceStatus: string; oversight: number; citizenBenefit: number; futureStrategy: number; cityDevelopment: number; weightedScore: number; summary: string; rawText: string; rationale: string; }` (backend `lib/queries/insights.ts`의 `InsightRow`와 필드명·nullability 100% 일치)
  - `export interface InsightFilters { member?: string; meeting?: string; minWeightedScore?: number; }`
  - `export async function fetchInsights(filters?: InsightFilters): Promise<InsightRow[]>` (시그니처 변경 없음, 내부 파라미터명만 변경)
  - `export async function fetchInsightById(id: number): Promise<InsightRow | null>` (변경 없음)

- [ ] **Step 1: `InsightRow`/`InsightFilters`를 8축으로 교체**

```ts
// mobile/src/lib/api.ts
export interface InsightRow {
  statementId: number;
  meetingTitle: string;
  memberName: string;
  tags: string[];
  topicsToWatch: string[];
  speechType: string;
  creativity: number | null;
  feasibility: number;
  evidenceLegal: number;
  persistence: number | null;
  persistenceStatus: string;
  oversight: number;
  citizenBenefit: number;
  futureStrategy: number;
  cityDevelopment: number;
  weightedScore: number;
  summary: string;
  rawText: string;
  rationale: string;
}

export interface InsightFilters {
  member?: string;
  meeting?: string;
  minWeightedScore?: number;
}

export async function fetchInsights(filters: InsightFilters = {}): Promise<InsightRow[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.meeting) params.set("meeting", filters.meeting);
  if (filters.minWeightedScore) params.set("minWeightedScore", String(filters.minWeightedScore));

  const res = await fetch(`${base}/api/insights?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
  return res.json();
}

export async function fetchInsightById(id: number): Promise<InsightRow | null> {
  const rows = await fetchInsights();
  return rows.find((r) => r.statementId === id) ?? null;
}
```

- [ ] **Step 2: 타입 체크 (전이 에러는 예상된 것)**

Run: `cd mobile && npx tsc --noEmit`
Expected: `src/components/InsightCard.tsx`(`row.learningLevel` 등 존재하지 않는 필드 참조)와 `src/app/index.tsx`(`row.geojeImpactScore`, `minGeojeImpact` prop)에서 에러 발생 — **이 두 파일은 Task 5에서 고친다. 지금 에러가 나는 게 정상이다.** `mobile/src/app/statement/[id].tsx`는 `meetingTitle`/`memberName`/`summary`/`rawText`/`rationale`만 쓰므로 에러 없어야 한다.

- [ ] **Step 3: 커밋**

```bash
cd mobile
git add src/lib/api.ts
git commit -m "feat(mobile): switch InsightRow/InsightFilters to real 8-axis schema"
```

---

### Task 3: `OverviewTab`/`ScoreGridTab`을 실데이터 타입으로 전환

**Files:**
- Modify: `mobile/src/components/table1/OverviewTab.tsx`
- Modify: `mobile/src/components/table1/ScoreGridTab.tsx`

**Interfaces:**
- Consumes: `InsightRow` from `@/lib/api` (Task 2), `AXES`/`AXIS_LABELS`/`axisCellLabel` from `@/lib/axes` (Task 1)
- Produces: `OverviewTab({ rows: InsightRow[] })`, `ScoreGridTab({ rows: InsightRow[]; footnote: string })` — prop 이름은 변경 없음, `rows`의 타입만 `Table1Row[]` → `InsightRow[]`로 바뀜. 두 컴포넌트 모두 행 탭 시 `/statement/${row.statementId}`로 이동한다(기존 `/prototype/table1/member/${row.member}` 대체).

- [ ] **Step 1: `OverviewTab.tsx` 수정**

```tsx
// mobile/src/components/table1/OverviewTab.tsx
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import type { InsightRow } from "@/lib/api";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const sorted = [...rows].sort((a, b) => b.weightedScore - a.weightedScore);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={sorted}
      keyExtractor={(row) => String(row.statementId)}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/statement/${item.statementId}`)}>
          <View style={styles.headerRow}>
            <Text style={styles.member}>{item.memberName}</Text>
            <Text style={styles.weightedScore}>{item.weightedScore.toFixed(2)}</Text>
          </View>
          <Text style={styles.topic}>{item.tags[0] ?? item.summary.slice(0, 24)}</Text>
          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing[12] },
  card: {
    padding: spacing[12],
    borderRadius: radius[8],
    backgroundColor: colors.background.normal,
    marginBottom: spacing[10],
    borderWidth: 1,
    borderColor: colors.line.solid,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  member: { ...typography.headline1, color: colors.label.normal },
  weightedScore: { ...typography.headline1, color: colors.primary.normal },
  topic: { ...typography.body2, color: colors.label.neutral, marginTop: spacing[2] },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing[8] },
  tagChip: {
    backgroundColor: colors.fill.normal,
    borderRadius: radius[16],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginRight: spacing[6],
    marginBottom: spacing[6],
  },
  tagLabel: { ...typography.caption1, color: colors.primary.normal },
});
```

- [ ] **Step 2: `ScoreGridTab.tsx` 수정**

```tsx
// mobile/src/components/table1/ScoreGridTab.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import type { InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel } from "@/lib/axes";
import { colors, typography, spacing, radius } from "@/theme/tokens";

const ROW_HEIGHT = 44;
const SCORE_COLUMN_WIDTH = 64;

export function ScoreGridTab({ rows, footnote }: { rows: InsightRow[]; footnote: string }) {
  const sorted = [...rows].sort((a, b) => b.weightedScore - a.weightedScore);

  return (
    <View style={styles.container}>
      <View style={styles.tableRow}>
        <View style={styles.stickyColumn}>
          <View style={[styles.cell, styles.headerCell, styles.memberCell]}>
            <Text style={styles.headerLabel}>의원</Text>
          </View>
          {sorted.map((row) => (
            <Pressable
              key={row.statementId}
              style={[styles.cell, styles.memberCell]}
              onPress={() => router.push(`/statement/${row.statementId}`)}
            >
              <Text style={styles.memberLabel}>{row.memberName}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.grid}>
          <View>
            <View style={styles.dataRow}>
              {AXES.map((axis) => (
                <View key={axis} style={[styles.cell, styles.scoreCell, styles.headerCell]}>
                  <Text style={styles.headerLabel}>{AXIS_LABELS[axis]}</Text>
                </View>
              ))}
            </View>
            {sorted.map((row) => (
              <View key={row.statementId} style={styles.dataRow}>
                {AXES.map((axis) => (
                  <View key={axis} style={[styles.cell, styles.scoreCell]}>
                    <Text
                      style={
                        axis === "persistence" && row.persistenceStatus === "pending_future_evaluation"
                          ? styles.pendingBadge
                          : styles.scoreLabel
                      }
                    >
                      {axisCellLabel(row[axis], axis, row.persistenceStatus)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text style={styles.footnote}>{footnote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[12] },
  tableRow: { flexDirection: "row" },
  stickyColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.line.solid,
  },
  grid: { flexGrow: 0 },
  dataRow: { flexDirection: "row" },
  cell: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
    paddingHorizontal: spacing[6],
  },
  headerCell: { backgroundColor: colors.background.alternative },
  memberCell: { width: 88, alignItems: "flex-start" },
  scoreCell: { width: SCORE_COLUMN_WIDTH },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal },
  scoreLabel: { ...typography.body2, color: colors.label.normal },
  pendingBadge: {
    ...typography.caption2,
    color: colors.label.alternative,
    backgroundColor: colors.fill.normal,
    borderRadius: radius[6],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    overflow: "hidden",
  },
  footnote: { ...typography.caption2, color: colors.label.alternative, marginTop: spacing[12] },
});
```

Note: `AXES`가 `Axis[]`이고 `row[axis]`는 `number | null` — `evidenceLegal` 등 실제로는 `number`인 축까지 인덱스 접근 시 TS가 `number | null`로 좁혀 추론할 수 있는데, `axisCellLabel`의 파라미터 타입이 `number | null`이라 문제 없다.

- [ ] **Step 3: 타입 체크 (전이 에러는 예상된 것)**

Run: `cd mobile && npx tsc --noEmit`
Expected: `src/app/prototype/table1/index.tsx`(`PILOT_ROWS`를 `OverviewTab`/`ScoreGridTab`에 넘기는데 이제 타입이 `Table1Row[]` ≠ `InsightRow[]`)에서 에러 발생 — **Task 7에서 이 파일 자체를 삭제하므로 지금 에러가 나는 게 정상이다.** `InsightCard.tsx`/`app/index.tsx` 에러는 Task 2와 동일하게 남아있어야 정상.

- [ ] **Step 4: 커밋**

```bash
cd mobile
git add src/components/table1/OverviewTab.tsx src/components/table1/ScoreGridTab.tsx
git commit -m "feat(mobile): rewire table1 components onto real InsightRow data"
```

---

### Task 4: 필터 UI를 가중평균 하한으로 전환 (`mobile/src/components/InsightFilters.tsx`)

**Files:**
- Modify: `mobile/src/components/InsightFilters.tsx`

**Interfaces:**
- Produces: `InsightFilters({ members, meetings, memberFilter, meetingFilter, minWeightedScore, onMemberChange, onMeetingChange, onMinWeightedScoreChange }: Props)` — prop 이름이 `minGeojeImpact`/`onMinGeojeImpactChange`에서 변경됨. 이 prop을 호출하는 쪽(Task 5의 `index.tsx`)에서 이름을 맞춰야 한다.

- [ ] **Step 1: prop명·라벨 텍스트 변경**

```tsx
// mobile/src/components/InsightFilters.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { colors, typography, spacing, radius } from "@/theme/tokens";

interface Props {
  members: string[];
  meetings: string[];
  memberFilter: string;
  meetingFilter: string;
  minWeightedScore: number;
  onMemberChange: (v: string) => void;
  onMeetingChange: (v: string) => void;
  onMinWeightedScoreChange: (v: number) => void;
}

export function InsightFilters({
  members,
  meetings,
  memberFilter,
  meetingFilter,
  minWeightedScore,
  onMemberChange,
  onMeetingChange,
  onMinWeightedScoreChange,
}: Props) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMemberChange("")} style={[styles.pill, !memberFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !memberFilter && styles.pillLabelActive]}>전체 의원</Text>
        </Pressable>
        {members.map((m) => (
          <Pressable key={m} onPress={() => onMemberChange(m)} style={[styles.pill, memberFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, memberFilter === m && styles.pillLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Pressable onPress={() => onMeetingChange("")} style={[styles.pill, !meetingFilter && styles.pillActive]}>
          <Text style={[styles.pillLabel, !meetingFilter && styles.pillLabelActive]}>전체 회의</Text>
        </Pressable>
        {meetings.map((m) => (
          <Pressable key={m} onPress={() => onMeetingChange(m)} style={[styles.pill, meetingFilter === m && styles.pillActive]}>
            <Text style={[styles.pillLabel, meetingFilter === m && styles.pillLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onMinWeightedScoreChange(n)}
            style={[styles.pill, minWeightedScore === n && styles.pillActive]}
          >
            <Text style={[styles.pillLabel, minWeightedScore === n && styles.pillLabelActive]}>가중평균 ≥ {n}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing[12], paddingTop: spacing[8] },
  row: { flexDirection: "row", marginBottom: spacing[8] },
  pill: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.fill.normal,
    marginRight: spacing[6],
  },
  pillActive: { backgroundColor: colors.primary.normal },
  pillLabel: { ...typography.label2, color: colors.label.normal },
  pillLabelActive: { color: colors.background.normal },
});
```

- [ ] **Step 2: 타입 체크 (전이 에러는 예상된 것)**

Run: `cd mobile && npx tsc --noEmit`
Expected: `src/app/index.tsx`에서 이제 `minGeojeImpact`/`onMinGeojeImpactChange` prop을 못 찾는 에러로 바뀜(기존 `row.geojeImpactScore` 에러와 함께) — **Task 5에서 고친다.**

- [ ] **Step 3: 커밋**

```bash
cd mobile
git add src/components/InsightFilters.tsx
git commit -m "feat(mobile): rename InsightFilters threshold prop to minWeightedScore"
```

---

### Task 5: 홈 화면을 표1 뷰로 재구성 (`mobile/src/app/index.tsx`)

**Files:**
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `fetchInsights`, `InsightRow` (`@/lib/api`, Task 2), `InsightFilters` (Task 4), `OverviewTab`/`ScoreGridTab` (Task 3), `SpeechType`, `weightFootnote` (`@/lib/axes`, Task 1)
- Produces: 홈 화면 — 회의 미선택 시 전체 랭킹 뷰(타이틀/각주 없음), 회의 선택 시 "표1. {회의명}" + 발언유형별 각주 + 개요/축별 점수 탭.

- [ ] **Step 1: 전면 재작성**

```tsx
// mobile/src/app/index.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightFilters } from "@/components/InsightFilters";
import { OverviewTab } from "@/components/table1/OverviewTab";
import { ScoreGridTab } from "@/components/table1/ScoreGridTab";
import { weightFootnote, type SpeechType } from "@/lib/axes";
import { colors, spacing, typography } from "@/theme/tokens";

type Tab = "overview" | "scores";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [minWeightedScore, setMinWeightedScore] = useState(1);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetchInsights().then(setRows).catch(() => setRows([]));
  }, []);

  const members = useMemo(() => [...new Set((rows ?? []).map((r) => r.memberName))].sort(), [rows]);
  const meetings = useMemo(() => [...new Set((rows ?? []).map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (!memberFilter || r.memberName === memberFilter) &&
      (!meetingFilter || r.meetingTitle === meetingFilter) &&
      r.weightedScore >= minWeightedScore
  );

  const speechTypesUsed = useMemo(
    () => [...new Set(filtered.map((r) => r.speechType as SpeechType))],
    [filtered]
  );

  if (!rows) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <InsightFilters
        members={members}
        meetings={meetings}
        memberFilter={memberFilter}
        meetingFilter={meetingFilter}
        minWeightedScore={minWeightedScore}
        onMemberChange={setMemberFilter}
        onMeetingChange={setMeetingFilter}
        onMinWeightedScoreChange={setMinWeightedScore}
      />

      <View style={styles.linkRow}>
        <Pressable style={styles.adminLink} onPress={() => router.push("/admin" as any)}>
          <Text style={styles.adminLinkText}>관리자</Text>
        </Pressable>
      </View>

      {meetingFilter ? (
        <View style={styles.header}>
          <Text style={styles.title}>표1. {meetingFilter}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>전체 발언 랭킹</Text>
          <Text style={styles.disclaimer}>회의를 선택하면 해당 회의의 표1로 전환됩니다.</Text>
        </View>
      )}

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabButton, tab === "overview" && styles.tabButtonActive]} onPress={() => setTab("overview")}>
          <Text style={[styles.tabLabel, tab === "overview" && styles.tabLabelActive]}>개요</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "scores" && styles.tabButtonActive]} onPress={() => setTab("scores")}>
          <Text style={[styles.tabLabel, tab === "scores" && styles.tabLabelActive]}>축별 점수</Text>
        </Pressable>
      </View>

      {tab === "overview" ? (
        <OverviewTab rows={filtered} />
      ) : (
        <ScoreGridTab rows={filtered} footnote={weightFootnote(speechTypesUsed)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.alternative },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.alternative },
  linkRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing[12] },
  adminLink: { paddingHorizontal: spacing[12], paddingVertical: spacing[4] },
  adminLinkText: { ...typography.label2, color: colors.label.alternative },
  header: { paddingHorizontal: spacing[12], paddingTop: spacing[4], paddingBottom: spacing[8] },
  title: { ...typography.headline1, color: colors.label.normal },
  disclaimer: { ...typography.caption1, color: colors.label.alternative, marginTop: spacing[4] },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing[12],
    backgroundColor: colors.fill.normal,
    borderRadius: 8,
    padding: spacing[2],
  },
  tabButton: { flex: 1, paddingVertical: spacing[8], alignItems: "center", borderRadius: 6 },
  tabButtonActive: { backgroundColor: colors.background.normal },
  tabLabel: { ...typography.label1, color: colors.label.alternative },
  tabLabelActive: { color: colors.primary.normal },
});
```

- [ ] **Step 2: 타입 체크 (남은 에러는 Task 7에서 삭제될 파일들만이어야 함)**

Run: `cd mobile && npx tsc --noEmit`
Expected: 남은 에러는 정확히 `src/components/InsightCard.tsx`와 `src/app/prototype/table1/index.tsx` 두 파일뿐이어야 한다 (`src/app/prototype/table1/member/[name].tsx`는 `pilotSampleData.ts`만 참조하므로 이번 마이그레이션 내내 에러 없이 컴파일된다 — Task 7에서 삭제되기 전까지는 그냥 도달 불가능한 죽은 라우트로 남아있는 것뿐이다). 이 두 파일 외에 에러가 있다면 이번 태스크나 이전 태스크에서 놓친 부분이 있다는 뜻이므로 되돌아가서 확인한다.

- [ ] **Step 3: 커밋**

```bash
cd mobile
git add src/app/index.tsx
git commit -m "feat(mobile): rebuild home screen as live table1 view"
```

---

### Task 6: 표2 상세 화면에 8축 점수 헤더 추가 (`mobile/src/app/statement/[id].tsx`)

**Files:**
- Modify: `mobile/src/app/statement/[id].tsx`

**Interfaces:**
- Consumes: `fetchInsightById`, `InsightRow` (`@/lib/api`), `AXES`, `AXIS_LABELS`, `axisCellLabel` (`@/lib/axes`, Task 1)
- Produces: 표2 상세 화면 — 가중평균 배지, 8축 점수 그리드, 향후 감시 주제 불릿, 기존 요약/원문/근거 섹션 유지.

- [ ] **Step 1: 헤더에 점수 그리드 + 향후 감시 주제 추가**

```tsx
// mobile/src/app/statement/[id].tsx
import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { fetchInsightById, type InsightRow } from "@/lib/api";
import { AXES, AXIS_LABELS, axisCellLabel } from "@/lib/axes";
import { colors, typography, spacing, radius } from "@/theme/tokens";

export default function StatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<InsightRow | null | undefined>(undefined);

  useEffect(() => {
    fetchInsightById(Number(id)).then(setRow);
  }, [id]);

  if (row === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (row === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>발언을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.meeting}>{row.meetingTitle}</Text>
      <Text style={styles.member}>{row.memberName}</Text>

      <View style={styles.scoreBadge}>
        <Text style={styles.scoreBadgeLabel}>가중평균 {row.weightedScore.toFixed(2)}</Text>
      </View>

      <View style={styles.scoreGrid}>
        {AXES.map((axis) => (
          <View key={axis} style={styles.scoreGridItem}>
            <Text style={styles.scoreGridLabel}>{AXIS_LABELS[axis]}</Text>
            <Text style={styles.scoreGridValue}>{axisCellLabel(row[axis], axis, row.persistenceStatus)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>연결된 향후 감시 주제</Text>
      {row.topicsToWatch.length > 0 ? (
        row.topicsToWatch.map((t) => (
          <Text key={t} style={styles.body}>
            · {t}
          </Text>
        ))
      ) : (
        <Text style={styles.body}>없음</Text>
      )}

      <Text style={styles.sectionTitle}>요약</Text>
      <Text style={styles.body}>{row.summary}</Text>
      <Text style={styles.sectionTitle}>회의록 원문</Text>
      <Text style={styles.body}>{row.rawText}</Text>
      <Text style={styles.sectionTitle}>AI 채점 근거</Text>
      <Text style={styles.body}>{row.rationale}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[16], backgroundColor: colors.background.normal },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.normal },
  meeting: { ...typography.caption2, color: colors.label.alternative },
  member: { ...typography.title3, color: colors.label.normal, marginBottom: spacing[8] },
  scoreBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.fill.normal,
    borderRadius: 8,
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    marginBottom: spacing[12],
  },
  scoreBadgeLabel: { ...typography.label1, color: colors.primary.normal },
  scoreGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[8] },
  scoreGridItem: {
    width: "23%",
    backgroundColor: colors.background.alternative,
    borderRadius: radius[8],
    paddingVertical: spacing[6],
    alignItems: "center",
  },
  scoreGridLabel: { ...typography.caption2, color: colors.label.alternative },
  scoreGridValue: { ...typography.label1, color: colors.label.normal, marginTop: spacing[2] },
  sectionTitle: { ...typography.label1, color: colors.label.normal, marginTop: spacing[12], marginBottom: spacing[4] },
  body: { ...typography.body2, color: colors.label.neutral },
});
```

- [ ] **Step 2: 타입 체크 (남은 에러는 여전히 Task 7 대상 3개 파일뿐이어야 함)**

Run: `cd mobile && npx tsc --noEmit`
Expected: Task 5와 동일하게 `InsightCard.tsx`, `prototype/table1/index.tsx` 두 파일만 에러 (`prototype/table1/member/[name].tsx`는 여전히 에러 없음 — 위 Task 5 Step 2 설명과 동일한 이유).

- [ ] **Step 3: 커밋**

```bash
cd mobile
git add src/app/statement/[id].tsx
git commit -m "feat(mobile): show 8-axis score grid and topics-to-watch on statement detail"
```

---

### Task 7: 5축/목업 잔재 삭제

**Files:**
- Delete: `mobile/src/components/InsightCard.tsx`
- Delete: `mobile/src/app/prototype/table1/index.tsx`
- Delete: `mobile/src/app/prototype/table1/member/[name].tsx`
- Delete: `mobile/src/lib/pilotSampleData.ts`

**Interfaces:**
- Consumes: 없음 (삭제만) — Task 3/5에서 이미 이 파일들에 대한 참조를 모두 제거했으므로 다른 파일에서 import하는 곳이 없어야 한다.

- [ ] **Step 1: 삭제 전 참조 재확인**

Run (PowerShell, mobile 디렉터리 안에서):
```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx src | Select-String "pilotSampleData|InsightCard|prototype/table1" | Where-Object { $_.Path -notmatch "InsightCard\.tsx|prototype.table1|pilotSampleData\.ts" }
```
Expected: 빈 결과 (삭제 대상 파일들 자기 자신 말고는 아무도 참조하지 않음).

- [ ] **Step 2: 파일 삭제**

```bash
cd mobile
git rm src/components/InsightCard.tsx
git rm src/app/prototype/table1/index.tsx
git rm src/app/prototype/table1/member/[name].tsx
git rm src/lib/pilotSampleData.ts
```

(`git rm`이 빈 디렉터리 `src/app/prototype/table1/member/`, `src/app/prototype/table1/`, `src/app/prototype/`도 자동으로 정리한다.)

- [ ] **Step 3: 전체 타입 체크 — 이번 마이그레이션의 최종 그린 게이트**

Run: `cd mobile && npx tsc --noEmit`
Expected: **에러 0건.** Task 2부터 계속 남아있던 전이 에러가 전부 해소되어야 한다.

- [ ] **Step 4: 커밋**

```bash
git commit -m "chore(mobile): remove 5-axis card and mock-only table1 prototype routes"
```

---

### Task 8: 수동 스모크 테스트 (실 API 대상)

테스트 러너가 없는 프로젝트이므로, 이 태스크가 이번 마이그레이션의 최종 검증이다. `mobile/.env`의 `EXPO_PUBLIC_API_BASE_URL`이 실제 배포된 backend를 가리키는지 먼저 확인한 뒤 진행한다.

**Files:** 없음 (코드 변경 없음, 검증만).

- [ ] **Step 1: 웹 타깃으로 앱 구동**

Run: `cd mobile && npx expo start --web`

- [ ] **Step 2: 홈 화면 — 전체 랭킹 뷰 확인**

브라우저에서 앱을 열고, 회의 필터가 "전체 회의"인 상태에서: (a) "전체 발언 랭킹" 타이틀이 보이는지, (b) 개요 탭에 실제 의원 이름·가중평균·태그가 뜨는지(0.00이나 undefined가 아닌지), (c) 5축 관련 문구("학습수준", "질의평점", "거제영향도" 등)가 화면 어디에도 남아있지 않은지 확인한다.

- [ ] **Step 3: 회의 선택 — 표1 뷰 확인**

회의 필터에서 회의 하나를 선택한다: (a) 타이틀이 "표1. {회의명}"으로 바뀌는지, (b) "축별 점수" 탭으로 전환 시 8개 축 헤더(창의성~거제발전)와 각 행 점수가 보이는지, (c) 화면 하단 각주에 해당 회의에 실제로 존재하는 발언유형에 대한 가중치 문구가 나오는지, (d) `persistence`가 `pending_future_evaluation`인 행에 "향후평가" 배지가 뜨는지 확인한다.

- [ ] **Step 4: 표2 상세 확인**

아무 행이나 탭해서 상세 화면 진입: (a) 가중평균 배지, (b) 8축 점수 그리드, (c) 향후 감시 주제(없으면 "없음"), (d) 요약/회의록 원문/AI 채점 근거 섹션이 모두 실제 텍스트로 채워지는지 확인한다.

- [ ] **Step 5: 결과 기록**

이상 없으면 이 태스크에 체크 완료 표시. 문제 발견 시 어느 Step에서 무엇이 어긋났는지 기록하고 해당 태스크로 돌아가 수정한다 (새 태스크를 추가하지 않고, 원인이 된 태스크를 고치고 그 태스크의 커밋을 새로 만든다).
