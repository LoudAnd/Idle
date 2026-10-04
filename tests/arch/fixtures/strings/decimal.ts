// Negative control: templates with decimals are not sentences (the trailing `(\s|$)` of the
// sentence pattern lets `0.03c` through; Appendix C).
export const STRINGS = {
  'challenge.c3.reward': 'ρ_k ×(1 − 0.03c)',
  'challenge.c1.reward': 'Slot exponent ×(1 + 0.03c)',
};
