# 표1 랭킹 화면 — 회의별 랭킹 복원 + 전체의원 랭킹 탭 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 표1 "개요" 탭을 의원×회의 조합당 1행(회의별 랭킹)으로 되돌리고 회의 열을 추가하며, 의원당 1행 평균 점수를 보여주는 "전체의원랭킹" 탭을 새로 추가한다.

**Architecture:** `mobile/src/lib/api.ts`의 기존 두 그룹화 함수(`groupByMemberMeeting`, `groupByMember`)는 이미 원하는 형태의 데이터를 제공하므로 변경하지 않는다. `OverviewTab.tsx`를 `groupByMemberMeeting` 기반으로 되돌려 회의 열을 추가하고(Task 1), `groupByMember`를 쓰는 새 컴포넌트 `AllMembersRankingTab.tsx`를 만들어 표1 화면(`index.tsx`)에 3번째 탭으로 연결한다(Task 2). 두 태스크 모두 기존 `OverviewTab.tsx`의 표+헤더정렬+`FlatList` 패턴을 그대로 재사용한다.

**Tech Stack:** React Native (Expo), TypeScript, 기존 `mobile/src/theme/tokens.ts` 디자인 토큰.

## Global Constraints

- 색상·폰트·spacing·radius는 반드시 `mobile/theme/tokens.ts`(`colors`/`typography`/`spacing`/`radius`)를 통해서만 사용한다. 하드코딩된 hex/px 값 금지. (CLAUDE.md 모바일 UI 스타일 규칙)
- `mobile/`은 `backend/`를 import하지 않는다 — 이 작업은 `mobile/` 내부 파일만 건드린다.
- `mobile/src/lib/api.ts`의 `groupByMemberMeeting`/`groupByMember`/`InsightMemberGroup`/`InsightGroup`은 변경하지 않는다 — 둘 다 그대로 유지하고 각각 다른 탭에서 재사용한다. (스펙 Architecture)
- 세부항목 탭(`ScoreGridTab.tsx`)과 그 축 가중치 범위 표시 기능은 이 작업의 변경 대상이 아니다.
- "전체의원랭킹" 탭 활성 중 상단 필터(의원 칩/회의 드롭다운)를 다시 조작하는 것을 막지 않는다 — 잠금 로직을 만들지 않는다. (스펙 Non-Goals)

---

## Task 1: 개요 탭을 회의별 랭킹(의원×회의 1행 + 회의 열)으로 되돌리기

**Files:**
- Modify: `mobile/src/components/table1/OverviewTab.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `groupByMemberMeeting(rows: InsightRow[]): InsightGroup[]`, `InsightGroup = { representative: InsightRow; siblings: InsightRow[] }`, `InsightRow` — 모두 `mobile/src/lib/api.ts`에 이미 존재(변경 없음). `meetingSessionTitle(fullTitle: string): string` — `mobile/src/lib/axes.ts`에 이미 존재(변경 없음).
- Produces: `OverviewTab({ rows: InsightRow[] })` — export 이름과 props 시그니처는 기존과 동일하게 유지한다(호출부인 `index.tsx`가 변경 없이 계속 동작해야 함).

### Step 1: OverviewTab.tsx를 회의 열 포함 표로 재작성

`mobile/src/components/table1/OverviewTab.tsx`의 전체 내용을 아래로 교체한다.

```tsx
// mobile/src/components/table1/OverviewTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightGroup, type InsightRow } from "@/lib/api";
import { meetingSessionTitle } from "@/lib/axes";
import { colors, typography, spacing } from "@/theme/tokens";

type SortField = "member" | "meeting" | "tags" | "score";
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meeting: "회의",
  tags: "태그",
  score: "평가점수",
};

function compareGroups(a: InsightGroup, b: InsightGroup, field: SortField): number {
  if (field === "score") {
    return a.representative.weightedScore - b.representative.weightedScore;
  }
  if (field === "member") {
    return a.representative.memberName.localeCompare(b.representative.memberName, "ko");
  }
  if (field === "meeting") {
    return meetingSessionTitle(a.representative.meetingTitle).localeCompare(
      meetingSessionTitle(b.representative.meetingTitle),
      "ko"
    );
  }
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

function defaultDirectionFor(field: SortField): SortDirection {
  return field === "score" ? "desc" : "asc";
}

export function OverviewTab({ rows }: { rows: InsightRow[] }) {
  const [sort, setSort] = useState<SortState>({ field: "score", direction: "desc" });

  const groups = useMemo(() => {
    const base = groupByMemberMeeting(rows);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort]);

  function handleHeaderPress(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: defaultDirectionFor(field) }
    );
  }

  function headerLabel(field: SortField) {
    if (sort.field !== field) return HEADER_LABELS[field];
    return `${HEADER_LABELS[field]} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.meetingCell]} onPress={() => handleHeaderPress("meeting")}>
        <Text style={styles.headerLabel}>{headerLabel("meeting")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.tagsCell]} onPress={() => handleHeaderPress("tags")}>
        <Text style={styles.headerLabel}>{headerLabel("tags")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress("score")}>
        <Text style={styles.headerLabel}>{headerLabel("score")}</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(group) => String(group.representative.statementId)}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      renderItem={({ item }) => {
        const row = item.representative;
        return (
          <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
            <View style={[styles.cell, styles.memberCell]}>
              <Text style={styles.memberLabel}>{row.memberName}</Text>
            </View>
            <View style={[styles.cell, styles.meetingCell]}>
              <Text style={styles.meetingLabel} numberOfLines={1}>
                {meetingSessionTitle(row.meetingTitle)}
              </Text>
            </View>
            <View style={[styles.cell, styles.tagsCell]}>
              <Text style={styles.tagsLabel} numberOfLines={1}>
                {row.tags.join(", ")}
              </Text>
            </View>
            <View style={[styles.cell, styles.scoreCell]}>
              <Text style={styles.scoreLabel}>{row.weightedScore.toFixed(2)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing[12] },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.background.alternative,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  cell: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  memberCell: { width: 88 },
  meetingCell: { width: 104 },
  tagsCell: { flex: 1 },
  scoreCell: { width: 72, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingLabel: { ...typography.caption1, color: colors.label.neutral },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
```

### Step 2: 타입 체크

Run: `cd mobile && npx tsc --noEmit`

Expected: 에러 없이 종료(exit code 0).

### Step 3: 개발 서버로 수동 QA

Run: `cd mobile && npx expo start --web`

브라우저에서 표1 → 개요 탭을 열고 다음을 확인한다:
- 상단 필터가 "전체 의원"/"전체회의"일 때, 여러 회의에서 발언한 의원이 회의 수만큼 별도 행으로 나온다(더 이상 의원당 1행으로 합쳐지지 않는다).
- 각 행의 "회의" 열 값이 그 행의 대표 발언이 속한 회의명(짧은 표기, 예: `제263회[임시회] 본회의 제2차`)과 일치한다.
- 상단에서 특정 의원 하나를 선택하면, 그 의원이 발언한 회의 수만큼 행이 남고 각 행의 회의 열 값이 서로 다르다.
- 상단에서 특정 회의 하나를 선택하면, 의원당 1행만 나오고 모든 행의 회의 열 값이 동일하다.
- "의원명"/"회의"/"태그"/"평가점수" 4개 헤더를 각각 탭하면 해당 기준으로 정렬되고, 다시 탭하면 오름차순/내림차순이 토글되며 헤더 라벨에 ▲/▼가 붙는다.
- 아무 데이터 행이나 탭하면 `/statement/[id]` 상세 화면으로 이동한다.

확인 후 개발 서버를 종료한다(Ctrl+C).

### Step 4: 커밋

```bash
git add mobile/src/components/table1/OverviewTab.tsx
git commit -m "fix(mobile): restore per-meeting rows in 표1 개요 tab, add 회의 column"
```

---

## Task 2: "전체의원랭킹" 탭 추가

**Files:**
- Create: `mobile/src/components/table1/AllMembersRankingTab.tsx`
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `groupByMember(rows: InsightRow[]): InsightMemberGroup[]`, `InsightMemberGroup = { memberName: string; representative: InsightRow; averageScore: number; meetingCount: number }`, `InsightRow` — 모두 `mobile/src/lib/api.ts`에 이미 존재(변경 없음).
- Produces: `AllMembersRankingTab({ rows: InsightRow[] })` — Task 1의 `OverviewTab`과 동일한 props 계약(단일 `rows` prop)이라 `index.tsx`에서 동일한 방식(`<AllMembersRankingTab rows={filtered} />`)으로 사용한다.

### Step 1: AllMembersRankingTab.tsx 작성

`mobile/src/components/table1/AllMembersRankingTab.tsx`를 새로 만든다.

```tsx
// mobile/src/components/table1/AllMembersRankingTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMember, type InsightMemberGroup, type InsightRow } from "@/lib/api";
import { colors, typography, spacing } from "@/theme/tokens";

type SortField = "member" | "meetingCount" | "tags" | "score";
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
  meetingCount: "참여회의수",
  tags: "태그",
  score: "평가점수",
};

function compareGroups(a: InsightMemberGroup, b: InsightMemberGroup, field: SortField): number {
  if (field === "score") {
    return a.averageScore - b.averageScore;
  }
  if (field === "meetingCount") {
    return a.meetingCount - b.meetingCount;
  }
  if (field === "member") {
    return a.memberName.localeCompare(b.memberName, "ko");
  }
  return a.representative.tags.join(", ").localeCompare(b.representative.tags.join(", "), "ko");
}

function defaultDirectionFor(field: SortField): SortDirection {
  return field === "tags" || field === "member" ? "asc" : "desc";
}

export function AllMembersRankingTab({ rows }: { rows: InsightRow[] }) {
  const [sort, setSort] = useState<SortState>({ field: "score", direction: "desc" });

  const groups = useMemo(() => {
    const base = groupByMember(rows);
    const sorted = [...base].sort((a, b) => compareGroups(a, b, sort.field));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, sort]);

  function handleHeaderPress(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: defaultDirectionFor(field) }
    );
  }

  function headerLabel(field: SortField) {
    if (sort.field !== field) return HEADER_LABELS[field];
    return `${HEADER_LABELS[field]} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={[styles.cell, styles.memberCell]} onPress={() => handleHeaderPress("member")}>
        <Text style={styles.headerLabel}>{headerLabel("member")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.meetingCountCell]} onPress={() => handleHeaderPress("meetingCount")}>
        <Text style={styles.headerLabel}>{headerLabel("meetingCount")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.tagsCell]} onPress={() => handleHeaderPress("tags")}>
        <Text style={styles.headerLabel}>{headerLabel("tags")}</Text>
      </Pressable>
      <Pressable style={[styles.cell, styles.scoreCell]} onPress={() => handleHeaderPress("score")}>
        <Text style={styles.headerLabel}>{headerLabel("score")}</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(group) => group.memberName}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      renderItem={({ item }) => {
        const row = item.representative;
        return (
          <Pressable style={styles.dataRow} onPress={() => router.push(`/statement/${row.statementId}`)}>
            <View style={[styles.cell, styles.memberCell]}>
              <Text style={styles.memberLabel}>{item.memberName}</Text>
            </View>
            <View style={[styles.cell, styles.meetingCountCell]}>
              <Text style={styles.meetingCountLabel}>{item.meetingCount}회</Text>
            </View>
            <View style={[styles.cell, styles.tagsCell]}>
              <Text style={styles.tagsLabel} numberOfLines={1}>
                {row.tags.join(", ")}
              </Text>
            </View>
            <View style={[styles.cell, styles.scoreCell]}>
              <Text style={styles.scoreLabel}>{item.averageScore.toFixed(2)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing[12] },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.background.alternative,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line.solid,
  },
  cell: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  memberCell: { width: 96 },
  meetingCountCell: { width: 88, alignItems: "flex-end" },
  tagsCell: { flex: 1 },
  scoreCell: { width: 72, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.primary.normal, textDecorationLine: "underline" },
  meetingCountLabel: { ...typography.body2, color: colors.label.neutral },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
```

**Note:** `defaultDirectionFor`는 `score`뿐 아니라 `meetingCount`도 내림차순(참여 회의가 많은 의원이 먼저 보이는 게 자연스러움)을 기본값으로 하고, `member`/`tags`는 오름차순을 기본값으로 한다 — Task 1의 `OverviewTab.tsx`와 달리 정렬 필드가 4개(그중 2개가 숫자형)라 `field === "score"` 단일 분기로는 부족해 이렇게 확장했다.

### Step 2: index.tsx에 3번째 탭 연결

`mobile/src/app/index.tsx`의 전체 내용을 아래로 교체한다.

```tsx
// mobile/src/app/index.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { fetchInsights, type InsightRow } from "@/lib/api";
import { InsightFilters } from "@/components/InsightFilters";
import { OverviewTab } from "@/components/table1/OverviewTab";
import { ScoreGridTab } from "@/components/table1/ScoreGridTab";
import { AllMembersRankingTab } from "@/components/table1/AllMembersRankingTab";
import { weightFootnote, meetingShortTitle, type SpeechType } from "@/lib/axes";
import { MEMBER_ROSTER } from "@/lib/memberRoster";
import { colors, spacing, typography, radius } from "@/theme/tokens";

type Tab = "overview" | "scores" | "allMembers";

export default function IndexScreen() {
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [memberFilter, setMemberFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetchInsights()
      .then(setRows)
      .catch(() => {
        setRows([]);
        setFetchFailed(true);
      });
  }, []);

  const members = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.memberName))].filter((m) => MEMBER_ROSTER.has(m)).sort(),
    [rows]
  );
  const meetings = useMemo(() => [...new Set((rows ?? []).map((r) => r.meetingTitle))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) => (!memberFilter || r.memberName === memberFilter) && (!meetingFilter || r.meetingTitle === meetingFilter)
  );

  const speechTypesUsed = useMemo(
    () => [...new Set(filtered.map((r) => r.speechType as SpeechType))],
    [filtered]
  );

  function handleAllMembersTabPress() {
    setMemberFilter("");
    setMeetingFilter("");
    setTab("allMembers");
  }

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
        onMemberChange={setMemberFilter}
        onMeetingChange={setMeetingFilter}
      />

      <View style={styles.linkRow}>
        <Pressable style={styles.adminLink} onPress={() => router.push("/admin" as any)}>
          <Text style={styles.adminLinkText}>관리자</Text>
        </Pressable>
      </View>

      {tab === "allMembers" ? (
        <View style={styles.header}>
          <Text style={styles.title}>전체의원 랭킹</Text>
          <Text style={styles.disclaimer}>의원별로 참여한 모든 회의의 평가점수를 산술평균한 값입니다.</Text>
        </View>
      ) : meetingFilter ? (
        <View style={styles.header}>
          <Text style={styles.title}>표1. {meetingShortTitle(meetingFilter)}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>회의별 랭킹</Text>
          <Text style={styles.disclaimer}>회의를 선택하면 해당 회의의 표1로 전환됩니다.</Text>
        </View>
      )}
      <Text style={styles.weightExplainer}>
        가중평균은 발언 유형(5분 이상 발언·예산·결산 심의·행정사무감사·조례 발안 설명)에 따라 8개 채점 항목에 서로
        다른 가중치를 곱해 합산한 값입니다. 항목별 가중치는 &apos;세부항목&apos; 탭에서 확인할 수 있습니다.
      </Text>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabButton, tab === "overview" && styles.tabButtonActive]} onPress={() => setTab("overview")}>
          <Text style={[styles.tabLabel, tab === "overview" && styles.tabLabelActive]}>개요</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "scores" && styles.tabButtonActive]} onPress={() => setTab("scores")}>
          <Text style={[styles.tabLabel, tab === "scores" && styles.tabLabelActive]}>세부항목</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "allMembers" && styles.tabButtonActive]} onPress={handleAllMembersTabPress}>
          <Text style={[styles.tabLabel, tab === "allMembers" && styles.tabLabelActive]}>전체의원랭킹</Text>
        </Pressable>
      </View>

      {fetchFailed ? (
        <View style={styles.center}>
          <Text style={styles.body}>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.body}>조건에 맞는 발언이 없습니다.</Text>
        </View>
      ) : tab === "overview" ? (
        <OverviewTab rows={filtered} />
      ) : tab === "allMembers" ? (
        <AllMembersRankingTab rows={filtered} />
      ) : (
        <ScoreGridTab rows={filtered} footnote={meetingFilter ? weightFootnote(speechTypesUsed, ["persistence"]) : ""} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.alternative },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.alternative },
  body: { ...typography.body2, color: colors.label.neutral },
  linkRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing[12] },
  adminLink: { paddingHorizontal: spacing[12], paddingVertical: spacing[4] },
  adminLinkText: { ...typography.label2, color: colors.label.alternative },
  header: { paddingHorizontal: spacing[12], paddingTop: spacing[4], paddingBottom: spacing[8] },
  title: { ...typography.headline1, color: colors.label.normal },
  disclaimer: { ...typography.caption1, color: colors.label.alternative, marginTop: spacing[4] },
  weightExplainer: {
    ...typography.caption2,
    color: colors.label.alternative,
    paddingHorizontal: spacing[12],
    paddingBottom: spacing[8],
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing[12],
    backgroundColor: colors.fill.normal,
    borderRadius: radius[8],
    padding: spacing[2],
  },
  tabButton: { flex: 1, paddingVertical: spacing[8], alignItems: "center", borderRadius: radius[6] },
  tabButtonActive: { backgroundColor: colors.background.normal },
  tabLabel: { ...typography.label1, color: colors.label.alternative },
  tabLabelActive: { color: colors.primary.normal },
});
```

이 교체로 바뀌는 부분은: (1) `AllMembersRankingTab` import 추가, (2) `Tab` 타입에 `"allMembers"` 추가, (3) `handleAllMembersTabPress` 함수 추가, (4) 제목/안내문 3-way 분기(`tab === "allMembers"` 우선), (5) 탭바에 3번째 `Pressable` 추가, (6) 본문 렌더링에 `tab === "allMembers"` 분기 추가. 나머지(데이터 페칭, 필터 계산, 스타일)는 기존과 동일하다.

### Step 3: 타입 체크

Run: `cd mobile && npx tsc --noEmit`

Expected: 에러 없이 종료(exit code 0). 새로 만든 `AllMembersRankingTab.tsx`와 수정된 `index.tsx`에 타입 에러가 없어야 한다.

### Step 4: 개발 서버로 수동 QA

Run: `cd mobile && npx expo start --web`

브라우저에서 표1 화면을 열고 다음을 확인한다:

- 탭바에 "개요" / "세부항목" / "전체의원랭킹" 3개 탭이 보인다.
- 상단에서 특정 의원 또는 특정 회의를 선택한 상태에서 "전체의원랭킹" 탭을 클릭하면, 상단 필터가 "전체 의원"/"전체회의"로 되돌아간다.
- "전체의원랭킹" 탭에서는 의원당 1행만 나온다(같은 의원이 여러 행으로 나오지 않는다).
- "참여회의수" 값이 그 의원을 개요 탭에서 필터링했을 때 나오는 행 수와 일치한다.
- "평가점수" 값이 그 의원의 개요 탭 행들의 평가점수를 산술평균한 값과 일치한다(예: 개요 탭에서 김경습 필터링 후 점수를 손으로 평균 내 비교).
- 제목이 "전체의원 랭킹"으로 바뀌고, 안내문이 "의원별로 참여한 모든 회의의 평가점수를 산술평균한 값입니다."로 표시된다.
- "의원명"/"참여회의수"/"태그"/"평가점수" 4개 헤더를 각각 탭하면 정렬되고, 다시 탭하면 방향이 토글된다.
- "전체의원랭킹" 탭에서 상단 의원 칩이나 회의 드롭다운을 다시 선택해도 에러 없이 좁혀진 결과가 표시된다(잠금 없음).
- "개요"/"세부항목" 탭으로 돌아가면 기존처럼(회의 미선택 시 제목 "회의별 랭킹", 회의 선택 시 "표1. {회의명}") 동작한다.
- 아무 데이터 행이나 탭하면 `/statement/[id]` 상세 화면으로 이동한다.

확인 후 개발 서버를 종료한다(Ctrl+C).

### Step 5: 커밋

```bash
git add mobile/src/components/table1/AllMembersRankingTab.tsx mobile/src/app/index.tsx
git commit -m "feat(mobile): add 전체의원랭킹 tab with per-member averaged scores"
```

---

## Self-Review Notes

- **Spec coverage:** 제목 "전체 발언 랭킹"→"회의별 랭킹" 변경(Task 2 Step 2), 개요 탭 의원×회의 1행 복원 + 회의 열(Task 1), 3번째 탭 "전체의원랭킹" 추가 + 필터 강제 리셋(Task 2), `groupByMember` 기반 의원당 1행 + 참여회의수/태그/평가점수 컬럼 + 4개 헤더 정렬(Task 2 Step 1), 탭별 제목 분기(Task 2 Step 2), `groupByMember`/`groupByMemberMeeting` 둘 다 삭제하지 않고 유지(Task 1·2 모두 `api.ts` 미수정) — 스펙의 모든 Goal/Key Decisions 항목이 태스크로 매핑됨.
- **Placeholder scan:** 없음 — 두 태스크 모두 완성된 전체 파일 코드를 제공.
- **Type consistency:** `OverviewTab({ rows: InsightRow[] })`와 `AllMembersRankingTab({ rows: InsightRow[] })`는 동일한 단일 `rows` prop 계약을 가져 `index.tsx`에서 동일한 방식으로 호출된다. `InsightGroup`(Task 1)과 `InsightMemberGroup`(Task 2)은 `mobile/src/lib/api.ts`에 이미 존재하는 서로 다른 타입이며, 각 태스크 코드에서 올바른 타입을 import했는지 확인함. `meetingSessionTitle`(Task 1에서 신규 사용)은 `mobile/src/lib/axes.ts:124`에 이미 export되어 있어 별도 구현이 필요 없음을 확인함.
