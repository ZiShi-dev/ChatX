export function typingLabel(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} يكتب…`;
  if (names.length === 2) return `${names[0]} و${names[1]} يكتبان…`;
  return `${names.length} أشخاص يكتبون…`;
}

/** Libellé court à côté du compositeur (nom seul ou compteur). */
export function typingComposerCaption(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} و${names[1]}`;
  return `${names.length}`;
}
