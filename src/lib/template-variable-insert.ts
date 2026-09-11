export function insertTemplateVariable(
  value: string,
  key: string,
  selectionStart = value.length,
  selectionEnd = selectionStart,
) {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const token = `{{${key}}}`;

  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    caret: start + token.length,
  };
}
