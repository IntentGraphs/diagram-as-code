export function escapeXml(text: string): string {
  return text
    // XML 1.0 cannot represent most C0 controls, even through character references.
    // Replace them with the Unicode replacement character before escaping markup.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '\uFFFD')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
