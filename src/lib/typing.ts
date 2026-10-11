export function typingLabel(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} يكتب…`;
  if (names.length === 2) return `${names[0]} و${names[1]} يكتبان…`;
  return `${names.length} أشخاص يكتبون…`;
}
