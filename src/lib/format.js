// A change as players read it: +1.2, -3, or a bare 0.0 with no sign.
export function signed(value, digits = 1) {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return fixed;
  return `${value > 0 ? '+' : '-'}${fixed}`;
}
