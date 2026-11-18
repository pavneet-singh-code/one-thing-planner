// Each subject gets a stable pastel colour (class s0..s5) from its name.
export const subjectClass = (subject: string) => {
  if (!subject) return 's-none';
  let h = 0;
  for (const ch of subject.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 's' + (h % 6);
};
