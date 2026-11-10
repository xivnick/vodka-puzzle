export const formulaCompletion261111_02 = {
  id: 'formula-completion-261111-2',
  title: '261111 수식완성(빼빼로데이)',
  summary: '빼빼로데이 수식완성',
  numbers: [1, 1, 1, 1],
  target: 10,
  decimal: true,
};

export const formulaCompletion260922_01 = {
  id: 'formula-completion-260922-1',
  title: '260922 수식완성 1',
  numbers: [3, 3, 8, 8],
  target: 24,
};

export const formulaCompletion260922_02 = {
  id: 'formula-completion-260922-2',
  title: '260922 수식완성 2',
  numbers: [5, 6, 13, 25],
  target: 34,
};

export const formulaCompletion260922_03 = {
  id: 'formula-completion-260922-3',
  title: '260922 수식완성 3',
  numbers: [15, 21, 35, 35],
  target: 4,
};

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

export function makeFraction(numerator, denominator = 1) {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) [n, d] = [-n, -d];
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

function add(a, b) { return makeFraction(a.n * b.d + b.n * a.d, a.d * b.d); }
function subtract(a, b) { return makeFraction(a.n * b.d - b.n * a.d, a.d * b.d); }
function multiply(a, b) { return makeFraction(a.n * b.n, a.d * b.d); }
function divide(a, b) { return makeFraction(a.n * b.d, a.d * b.n); }

export function tokenizeFormula(text, decimal = false) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (/\s/.test(character)) { index += 1; continue; }
    if (/\d/.test(character) || (decimal && character === '.')) {
      let value = character;
      index += 1;
      while (index < text.length && /\d/.test(text[index])) value += text[index++];
      if (decimal && character !== '.' && text[index] === '.') {
        value += text[index++];
      }
      if (decimal && value.includes('.')) {
        while (index < text.length && /\d/.test(text[index])) value += text[index++];
      }
      tokens.push(value);
      continue;
    }
    if ('+-*/()'.includes(character)) { tokens.push(character); index += 1; continue; }
    throw new Error('invalid token');
  }
  return tokens;
}

export function evaluateFormula(formula, decimal = false) {
  const tokens = Array.isArray(formula) && !decimal
    ? [...formula]
    : tokenizeFormula(Array.isArray(formula) ? formula.join('') : String(formula), decimal);
  let index = 0;
  const used = [];
  const peek = () => tokens[index];
  const consume = expected => {
    if (peek() !== expected) throw new Error('invalid syntax');
    index += 1;
  };

  function parseFactor() {
    const token = peek();
    if (decimal && /^(?:\d|\d?\.\d+)$/.test(token || '')) {
      index += 1;
      used.push(...token.replace('.', ''));
      const [integer, fractional = ''] = token.split('.');
      return makeFraction((integer || '0') + fractional, 10n ** BigInt(fractional.length));
    }
    if (!decimal && /^\d+$/.test(token || '')) {
      index += 1;
      used.push(token);
      return makeFraction(token);
    }
    if (token === '(') {
      consume('(');
      const value = parseAddSubtract();
      consume(')');
      return value;
    }
    throw new Error('invalid syntax');
  }

  function parseMultiplyDivide() {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[index++];
      const right = parseFactor();
      value = operator === '*' ? multiply(value, right) : divide(value, right);
    }
    return value;
  }

  function parseAddSubtract() {
    let value = parseMultiplyDivide();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[index++];
      const right = parseMultiplyDivide();
      value = operator === '+' ? add(value, right) : subtract(value, right);
    }
    return value;
  }

  if (!tokens.length) return null;
  const value = parseAddSubtract();
  if (index !== tokens.length) throw new Error('invalid syntax');
  return { value, used };
}

export function hasExactNumbers(numbers, used) {
  const counts = values => values.reduce((map, value) => {
    const key = String(value);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  const expected = counts(numbers);
  const actual = counts(used);
  return expected.size === actual.size
    && [...expected].every(([number, count]) => actual.get(number) === count);
}

export function isSolvedFormula(puzzle, formula) {
  try {
    const result = evaluateFormula(formula, puzzle.decimal);
    if (puzzle.decimal && (Array.isArray(formula) ? formula.join('') : String(formula)).split('.').length !== 2) return false;
    return Boolean(result)
      && result.value.n === BigInt(puzzle.target) * result.value.d
      && hasExactNumbers(puzzle.numbers, result.used);
  } catch {
    return false;
  }
}

export function formatFraction(value) {
  if (value.d === 1n) return value.n.toString();
  const negative = value.n < 0n;
  const numerator = negative ? -value.n : value.n;
  const integer = numerator / value.d;
  let remainder = numerator % value.d;
  let decimals = '';
  for (let index = 0; index < 3 && remainder !== 0n; index += 1) {
    remainder *= 10n;
    decimals += (remainder / value.d).toString();
    remainder %= value.d;
  }
  const sign = negative ? '-' : '';
  if (remainder === 0n) return `${sign}${integer}.${decimals}`;
  return `${sign}${integer}.${decimals.slice(0, 2)}…`;
}
