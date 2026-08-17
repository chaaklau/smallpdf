export const PRESETS = {
  lossless: {
    id: "lossless",
    label: "Lossless",
    mode: "lossless",
    suffix: "optimized",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    mode: "flatten",
    dpi: 160,
    jpegQuality: 78,
    suffix: "compressed",
  },
  small: {
    id: "small",
    label: "Small",
    mode: "flatten",
    dpi: 120,
    jpegQuality: 65,
    suffix: "small",
  },
};
