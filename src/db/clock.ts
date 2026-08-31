export function nextTimestamp(previous: number, candidate: number): number {
  if (!Number.isSafeInteger(previous) || previous < 0) {
    throw new RangeError('Previous timestamp must be a non-negative safe integer.');
  }

  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new RangeError('Candidate timestamp must be a non-negative safe integer.');
  }

  return Math.max(candidate, previous + 1);
}
