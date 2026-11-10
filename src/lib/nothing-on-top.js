// Fixed digits transcribed from the supplied photo. No stored solution.
export const nothingOnTop = {
 name: 'Nothing on top',
 difficulty: 3,
 summary: '상하좌우로 이웃한 칸에는 연속한 숫자가 들어갈 수 없습니다',
 nonConsecutive: true,
 givens: [
  '000000000',
  '000000000',
  '000000000',
  '000000000',
  '000000000',
  '309040106',
  '090405030',
  '807060504',
  '000000000',
 ].join('').split('').map(Number),
 rules: ['Non-consecutive: 상하좌우로 붙어 있는 두 칸에는 차이가 1인 숫자가 들어갈 수 없습니다.'],
};
