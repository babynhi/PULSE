export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return seconds + ' sec';
  return minutes + ' min' + (remainder ? ' ' + remainder + ' sec' : '');
}
