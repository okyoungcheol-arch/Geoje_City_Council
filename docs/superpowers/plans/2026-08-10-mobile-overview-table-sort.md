# 표1 "개요" 탭 표 형태 전환 + 헤더 정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mobile/src/components/table1/OverviewTab.tsx`를 카드 리스트에서 의원명/태그/평가점수 3컬럼 표로 바꾸고, 헤더를 탭하면 해당 컬럼 기준으로 정렬(재탭 시 방향 토글)되게 만든다.

**Architecture:** 컴포넌트 하나만 수정하는 단일 태스크. `groupByMemberMeeting()`이 반환하는 그룹을 로컬 정렬 상태(`field`/`direction`)에 따라 정렬한 뒤, `FlatList`(`stickyHeaderIndices={[0]}`)로 렌더링한다. 헤더 행은 3개의 `Pressable` 셀이며 탭 시 정렬 상태만 바꾼다. 데이터 행은 기존과 동일하게 탭하면 `/statement/[id]`로 이동한다.

**Tech Stack:** React Native (Expo), TypeScript, 기존 `mobile/src/theme/tokens.ts` 디자인 토큰.

## Global Constraints

- 색상·폰트·spacing·radius는 반드시 `mobile/theme/tokens.ts`(`colors`/`typography`/`spacing`/`radius`)를 통해서만 사용한다. 하드코딩된 hex/px 값 금지. (CLAUDE.md 모바일 UI 스타일 규칙)
- `mobile/`은 `backend/`를 import하지 않는다 — 이 작업은 `mobile/` 내부 파일만 건드린다.
- 카드 뷰와 표 뷰를 전환하는 토글은 만들지 않는다 — 표로 완전히 대체한다. (스펙 Non-Goals)
- "이 회의 발언 N건" 배지, 상단 토픽 텍스트는 제거한다 — 3개 컬럼(의원명/태그/평가점수)에 없는 정보는 유지하지 않는다. (스펙 Non-Goals)
- `ScoreGridTab.tsx`(표2)는 이 작업의 변경 대상이 아니다. 단 표 스타일(테두리·헤더 배경·토큰 사용법)은 그대로 재사용한다.

---

## Task 1: OverviewTab을 정렬 가능한 표로 전환

**Files:**
- Modify: `mobile/src/components/table1/OverviewTab.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `groupByMemberMeeting(rows: InsightRow[]): InsightGroup[]` and `InsightRow` type from `mobile/src/lib/api.ts` (기존 그대로, 변경 없음). `InsightGroup`은 `{ representative: InsightRow; siblings: InsightRow[] }` 형태(기존 `OverviewTab.tsx`에서 이미 이렇게 사용 중).
- Produces: `OverviewTab({ rows: InsightRow[] })` — export 이름과 props 시그니처는 기존과 동일하게 유지한다(호출부인 표1 화면이 변경 없이 계속 동작해야 함).

### Step 1: 호출부 확인 — props 계약이 바뀌지 않는지 확인

`OverviewTab`을 사용하는 곳을 확인해 props가 `{ rows }` 하나뿐임을 재확인한다. (`InsightGroup`은 `mobile/src/lib/api.ts:47`에 이미 `export interface InsightGroup`으로 존재하므로 Step 2에서 별도 export 추가는 필요 없다.)

Run: `grep -rn "OverviewTab" mobile/src --include=*.tsx -l`

Expected: `mobile/src/components/table1/OverviewTab.tsx`와 이를 import하는 화면 파일(표1 탭 화면) 두 곳만 나온다. import하는 쪽에서 `<OverviewTab rows={...} />` 외의 다른 prop을 넘기지 않는지 눈으로 확인한다.

### Step 2: OverviewTab.tsx를 표+정렬 컴포넌트로 재작성

`mobile/src/components/table1/OverviewTab.tsx`의 전체 내용을 아래로 교체한다.

```tsx
// mobile/src/components/table1/OverviewTab.tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { groupByMemberMeeting, type InsightGroup, type InsightRow } from "@/lib/api";
import { colors, typography, spacing } from "@/theme/tokens";

type SortField = "member" | "tags" | "score";
type SortDirection = "asc" | "desc";
type SortState = { field: SortField; direction: SortDirection };

const HEADER_LABELS: Record<SortField, string> = {
  member: "의원명",
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
  headerRow: { flexDirection: "row", backgroundColor: colors.background.alternative },
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
  tagsCell: { flex: 1 },
  scoreCell: { width: 72, alignItems: "flex-end" },
  headerLabel: { ...typography.label2, color: colors.label.alternative },
  memberLabel: { ...typography.label1, color: colors.label.normal },
  tagsLabel: { ...typography.body2, color: colors.label.neutral },
  scoreLabel: { ...typography.headline1, color: colors.primary.normal },
});
```

**Note:** 파일에 `radius`를 import했지만 이 리라이트에서는 셀 배경/카드 스타일을 쓰지 않아 실제로 사용하지 않는다. import 문에서 `radius`를 제거한다 — 아래처럼 최종 import는 `colors, typography, spacing`만 남긴다.

```tsx
import { colors, typography, spacing } from "@/theme/tokens";
```

### Step 3: 타입 체크

Run: `cd mobile && npx tsc --noEmit`

Expected: 에러 없이 종료(exit code 0). `OverviewTab.tsx`와 관련된 타입 에러(`InsightGroup` import 실패, prop 불일치 등)가 없어야 한다.

### Step 4: 개발 서버로 수동 QA

Run: `cd mobile && npx expo start --web`

브라우저에서 표1 → 개요 탭을 열고 다음을 확인한다:
- 카드가 아니라 의원명/태그/평가점수 3컬럼 표로 보인다.
- 기본 정렬이 평가점수 내림차순이다(가장 높은 점수가 맨 위).
- "평가점수" 헤더를 한 번 더 탭하면 오름차순으로 바뀌고, 헤더 라벨에 ▲가 표시된다.
- "의원명" 헤더를 탭하면 의원명 가나다순으로 정렬되고, 헤더 라벨에 ▲가 표시된다.
- 태그가 긴 행이 한 줄로 말줄임(...) 처리된다.
- 아무 데이터 행이나 탭하면 `/statement/[id]` 상세 화면으로 이동한다.
- 스크롤해도 헤더 행이 화면 상단에 고정되어 있다.

확인 후 개발 서버를 종료한다(Ctrl+C).

### Step 5: 커밋

```bash
git add mobile/src/components/table1/OverviewTab.tsx
git commit -m "feat(mobile): convert 표1 개요 tab to sortable table"
```

---

## Self-Review Notes

- **Spec coverage:** 표 전환(컬럼 3개), 태그 쉼표 나열, 헤더 클릭 정렬+토글, 기본 정렬(점수 내림차순), 헤더 고정(stickyHeaderIndices), 기존 토큰 재사용, 배지/토픽 텍스트 제거 — 모두 Step 2 코드에 반영됨.
- **Placeholder scan:** 없음 — 전체 파일 코드가 완성된 상태로 제공됨.
- **Type consistency:** `OverviewTab({ rows: InsightRow[] })` 시그니처는 기존과 동일하게 유지되어 호출부 변경 불필요. `InsightGroup`은 `mobile/src/lib/api.ts:47`에 이미 `export interface InsightGroup`으로 존재함을 확인했다 — Step 2의 `import { ..., type InsightGroup, ... } from "@/lib/api"`는 추가 작업 없이 바로 동작한다.
