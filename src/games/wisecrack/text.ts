/**
 * Text normalization for comparing answers (JINX detection).
 * Fold case, trim, collapse whitespace, strip diacritics, drop leading
 * articles and surrounding punctuation so "The Banana!" === "banana".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '')
    .trim()
}

/** True when two answers are effectively identical (→ JINX). */
export function sameAnswer(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  return na.length > 0 && na === nb
}
