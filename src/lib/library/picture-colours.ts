// The colours of the share picture (ADR 0019, R4): one fixed dark look, the
// dark values of src/styles/theme.css as hex, since a canvas reads no CSS
// variable. picture-colours.test.ts fails when one differs from theme.css.
// Text, lines and fills are ink at the shares of theme.css (the one look,
// ADR 0018), so the glow shows through them as it does on the screen.

export const pictureColours = {
  ground: '#121317',
  ink: '#f1f1ec',
  accent: '#8a9bff',
  accentFill: '#4b5fe6',
};

export const pictureAlpha = {
  textHeading: 0.75,
  textQuiet: 0.72,
  lineCard: 0.09,
  lineButton: 0.18,
  fillCard: 0.05,
  shadeFaint: 0.14,
};

// The glow of Home and Statistics (glow.css): a radial gradient whose colour
// fades at these shares and stops, each blob at its opacity.
export const pictureGlow = {
  alphas: [0.7, 0.48, 0.24, 0.07],
  stops: [0, 0.3, 0.55, 0.78],
  opacities: [0.55, 0.4, 0.3],
};

// "#f1f1ec" at 72 %: "#f1f1ecb8", the form a canvas reads.
export function withAlpha(hex: string, share: number): string {
  return `${hex}${Math.round(share * 255)
    .toString(16)
    .padStart(2, '0')}`;
}
