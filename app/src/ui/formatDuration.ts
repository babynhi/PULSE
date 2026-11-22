export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return seconds + ' sec';
  return minutes + ' min' + (remainder ? ' ' + remainder + ' sec' : '');
}

export function formatClock(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
