export default function hotRanking(ups: number, downs: number, date: Date): number {
  const upvotes = ups || 0;
  const downvotes = downs || 0;
  const score = upvotes - downvotes;
  if (Object.prototype.toString.call(date) !== '[object Date]') {
    throw new Error('You must pass a valid date object');
  }
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = epochSeconds(date) - 1134028003;
  const rank = sign * order + seconds / 45000;
  return Number(rank.toPrecision(11));
}

function epochSeconds(date: Date): number {
  return (date.getTime() - new Date(1970, 1, 1).getTime()) / 1000;
}
