// mobile/src/theme/tokens.ts
export const colors = {
  primary: { normal: "#0066FF", strong: "#005EEB", heavy: "#0054D1" },
  label: {
    normal: "#171719",
    strong: "#000000",
    neutral: "rgba(46,47,51,0.88)",
    alternative: "rgba(55,56,60,0.61)",
    assistive: "rgba(55,56,60,0.28)",
    disable: "rgba(55,56,60,0.16)",
  },
  background: { normal: "#FFFFFF", alternative: "#F7F7F8" },
  line: { normal: "rgba(112,115,124,0.22)", solid: "#EAEBEC" },
  fill: { normal: "rgba(112,115,124,0.08)", strong: "rgba(112,115,124,0.16)", alternative: "rgba(112,115,124,0.05)" },
  status: { positive: "#00BF40", cautionary: "#FF9200", negative: "#FF4242", info: "#0066FF" },
} as const;

export const fonts = {
  sans: "Pretendard JP", // body/UI text
  display: "Wanted Sans Variable", // brand/headline text
  mono: "SF Mono",
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// Tracking is specified as a range in the source (display/title: -0.023~-0.029em,
// body/label: +0.006~+0.031em). These are representative midpoints per group —
// see docs/design-tokens/wanted-design-system.md if a size needs a more exact value.
const TITLE_TRACKING_EM = -0.025;
const BODY_TRACKING_EM = 0.015;

function typeStyle(fontSize: number, lineHeightRatio: number, trackingEm: number, fontFamily: string, fontWeight: (typeof fontWeights)[keyof typeof fontWeights]) {
  return {
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight: Math.round(fontSize * lineHeightRatio),
    letterSpacing: Number((fontSize * trackingEm).toFixed(2)),
  };
}

export const typography = {
  display1: typeStyle(56, 1.30, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  display2: typeStyle(40, 1.30, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  display3: typeStyle(36, 1.334, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  title1: typeStyle(32, 1.375, TITLE_TRACKING_EM, fonts.display, fontWeights.bold),
  title2: typeStyle(28, 1.358, TITLE_TRACKING_EM, fonts.display, fontWeights.semibold),
  title3: typeStyle(24, 1.334, TITLE_TRACKING_EM, fonts.display, fontWeights.semibold),
  heading1: typeStyle(22, 1.364, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  heading2: typeStyle(20, 1.40, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  headline1: typeStyle(18, 1.445, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  headline2: typeStyle(17, 1.412, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  body1: typeStyle(16, 1.50, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  body2: typeStyle(15, 1.467, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  label1: typeStyle(14, 1.429, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  label2: typeStyle(13, 1.385, BODY_TRACKING_EM, fonts.sans, fontWeights.semibold),
  caption1: typeStyle(12, 1.334, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
  caption2: typeStyle(11, 1.273, BODY_TRACKING_EM, fonts.sans, fontWeights.medium),
} as const;

export const spacing = {
  2: 2, 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, 28: 28, 32: 32, 40: 40, 48: 48, 64: 64,
} as const;

export const radius = {
  4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, full: 9999,
} as const;
