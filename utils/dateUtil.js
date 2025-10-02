export function getTodayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
