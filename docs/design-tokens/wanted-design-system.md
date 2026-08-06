# Wanted Design System — 원본 토큰 값 (출처)

**출처:** claude.ai Design System 프로젝트 "Wanted Design System" (Wanted `.fig` 파일로부터 재구성), 사용자가 2026-08-06 대화에서 직접 제공.
**용도:** 이 저장소(거제시의회 제10대 인사이트 모바일 앱)의 UI 스타일 기본값으로 채택. 실제 사용처는 `mobile/theme/tokens.ts` (Task 11에서 생성).

이 문서는 **원본 값의 기록**입니다. 코드에서 값을 바꿀 일이 있으면 이 문서도 함께 갱신하세요.

## 색상 (핵심 시맨틱 토큰)

```
--color-primary-normal: #0066FF
--color-primary-strong: #005EEB
--color-primary-heavy:  #0054D1

--color-label-normal:      #171719
--color-label-strong:      #000000
--color-label-neutral:     rgba(46,47,51,.88)
--color-label-alternative: rgba(55,56,60,.61)
--color-label-assistive:   rgba(55,56,60,.28)
--color-label-disable:     rgba(55,56,60,.16)

--color-background-normal:      #FFFFFF
--color-background-alternative: #F7F7F8

--color-line-normal: rgba(112,115,124,.22)
--color-line-solid:  #EAEBEC

--color-fill-normal:      rgba(112,115,124,.08)
--color-fill-strong:      rgba(112,115,124,.16)
--color-fill-alternative: rgba(112,115,124,.05)

--color-status-positive:  #00BF40
--color-status-cautionary:#FF9200
--color-status-negative:  #FF4242
--color-status-info:      #0066FF
```

원자 팔레트(참고용, 컴포넌트에서 직접 쓰지 않고 위 시맨틱 토큰을 통해서만 사용): `blue-50 #0066FF`, `red-50 #FF4242`, `green-50 #00BF40`, `orange-50 #FF9200`, `coolNeutral-10 #171719` (각 색상당 99→0, 12~15단계 — 전체 팔레트는 원본 `colors_and_type.css` 참고).

## 타이포그래피

- **폰트 패밀리:** `--font-sans: "Pretendard JP"` (본문/UI), `--font-display: "Wanted Sans Variable"` (브랜드/헤드라인), `--font-mono: "SF Mono"`
- **두께:** regular 400 / medium 500 / semibold 600 / bold 700
- **램프 (px / line-height):**

| 스타일 | 크기 | 줄높이 배수 |
|---|---|---|
| display1 | 56 | 1.30 |
| display2 | 40 | 1.30 |
| display3 | 36 | 1.334 |
| title1 | 32 | 1.375 |
| title2 | 28 | 1.358 |
| title3 | 24 | 1.334 |
| heading1 | 22 | 1.364 |
| heading2 | 20 | 1.40 |
| headline1 | 18 | 1.445 |
| headline2 | 17 | 1.412 |
| body1 | 16 | 1.50 |
| body2 | 15 | 1.467 |
| label1 | 14 | 1.429 |
| label2 | 13 | 1.385 |
| caption1 | 12 | 1.334 |
| caption2 | 11 | 1.273 |

- **트래킹(자간):** display/title 계열 −0.023~−0.029em, body/label 계열 +0.006~+0.031em. `mobile/theme/tokens.ts`에서는 각 그룹의 대표값(display/title: −0.025em, heading 이하: +0.015em)으로 근사한다 — 사이즈별 정확한 개별 값이 필요해지면 원본 `colors_and_type.css`에서 다시 확인할 것.

## Spacing (base-4)

`2 4 6 8 10 12 16 20 24 28 32 40 48 64` (px)

## Radius

`4 6 8 10 12 16 20 24` (px), `full = 9999`

## 폰트 파일 관련 참고

Pretendard(JP)와 Wanted Sans는 둘 다 오픈소스로 배포되는 폰트다 (Pretendard: `github.com/orioncactus/pretendard`, Wanted Sans: `github.com/wanteddev/wanted-sans`). 이 저장소에는 아직 폰트 바이너리 파일이 없으므로, Task 11에서 앱을 스캐폴딩할 때 `expo-font`로 실제 폰트 파일을 로드하는 단계를 추가해야 한다 — 그 전까지 `mobile/theme/tokens.ts`의 `fontFamily` 값은 해당 폰트가 로드되지 않으면 OS 기본 폰트로 자동 폴백된다.
