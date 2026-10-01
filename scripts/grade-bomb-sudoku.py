"""Audit the demo's intended human deductions, without guessing or solution counting.

Classic deductions always run before bomb deductions. This makes a bomb step
in the trace a real way past a stall under the permitted classic techniques.
No completed answer is saved or compared with the player's input.
"""

from collections import Counter
import json
from pathlib import Path
import re


UNITS = (
    [[r * 9 + c for c in range(9)] for r in range(9)]
    + [[r * 9 + c for r in range(9)] for c in range(9)]
    + [[(b // 3 * 3 + n // 3) * 9 + b % 3 * 3 + n % 3
        for n in range(9)] for b in range(9)]
)
PEERS = [set(j for unit in UNITS if i in unit for j in unit) - {i}
         for i in range(81)]


def grade(givens, bombs, use_bombs=True):
    bomb_set = set(bombs)
    numbers = [i for i in range(81) if i not in bomb_set]
    number_units = [[i for i in unit if i not in bomb_set] for unit in UNITS]
    domains = []
    for i, value in enumerate(givens):
        if value:
            domains.append({value})
        elif i not in bomb_set:
            domains.append(set(range(1, 9)))
        elif i % 9 == 0:
            domains.append({0.5})
        elif i % 9 == 8:
            domains.append({8.5})
        else:
            domains.append({n + 0.5 for n in range(1, 8)})

    trace = []

    def reduce(index, keep, technique, source=()):
        after = domains[index] & set(keep)
        if after == domains[index]:
            return False
        trace.append({
            'technique': technique, 'cell': index,
            'before': sorted(domains[index]), 'after': sorted(after),
            'source': list(source),
        })
        domains[index] = after
        return True

    def eliminate_pairs(unit, technique):
        changed = False
        pairs = sorted({tuple(sorted(domains[i])) for i in unit
                        if len(domains[i]) == 2})
        for pair in pairs:
            twins = [i for i in unit if domains[i] == set(pair)]
            if len(twins) != 2:
                continue
            for i in unit:
                if i not in twins:
                    changed = reduce(i, domains[i] - set(pair), technique, twins) or changed
        return changed

    for _ in range(3000):
        if any(not domain for domain in domains):
            return {'finished': False, 'contradiction': True, 'trace': trace}
        for unit in number_units + [bombs]:
            singles = [next(iter(domains[i])) for i in unit if len(domains[i]) == 1]
            if len(singles) != len(set(singles)):
                return {'finished': False, 'contradiction': True, 'trace': trace}

        changed = False
        for i in numbers:
            if len(domains[i]) == 1:
                continue
            source = sorted(j for j in PEERS[i] - bomb_set if len(domains[j]) == 1)
            used = {next(iter(domains[j])) for j in source}
            changed = reduce(i, domains[i] - used, 'sudoku-eliminate', source) or changed
        if changed:
            continue

        for unit in number_units:
            for value in range(1, 9):
                places = [i for i in unit if value in domains[i]]
                if len(places) == 1:
                    changed = reduce(places[0], {value}, 'sudoku-hidden-single', unit) or changed
        if changed:
            continue

        for unit in number_units:
            changed = eliminate_pairs(unit, 'sudoku-pair') or changed
        if changed:
            continue

        if not use_bombs:
            break

        for b in bombs:
            if b % 9 in (0, 8):
                continue
            left, right = b - 1, b + 1
            a, z = domains[left].copy(), domains[right].copy()
            technique = 'bomb-order-pair' if len(a) == 2 and a == z else 'bomb-order'
            changed = reduce(left, {v for v in a if v < max(z)},
                             technique, [b, right]) or changed
            changed = reduce(right, {v for v in z if v > min(a)},
                             technique, [b, left]) or changed
        if changed:
            continue

        for b in bombs:
            col = b % 9
            keep = {v for v in domains[b]
                    if (col == 0 or min(domains[b - 1]) < v)
                    and (col == 8 or max(domains[b + 1]) > v)}
            neighbors = [j for j in (b - 1, b + 1) if j // 9 == b // 9]
            changed = reduce(b, keep, 'bomb-range', neighbors) or changed
        if changed:
            continue

        source = [b for b in bombs if len(domains[b]) == 1]
        used = {next(iter(domains[b])) for b in source}
        for b in bombs:
            if len(domains[b]) > 1:
                changed = reduce(b, domains[b] - used, 'bomb-used-values', source) or changed
        if changed:
            continue

        for value in (n + 0.5 for n in range(9)):
            places = [b for b in bombs if value in domains[b]]
            if len(places) == 1:
                changed = reduce(places[0], {value}, 'bomb-only-place', bombs) or changed
        if changed:
            continue

        if eliminate_pairs(bombs, 'bomb-pair'):
            continue

        for b in bombs:
            if b % 9 > 0:
                changed = reduce(b - 1, {v for v in domains[b - 1] if v < max(domains[b])},
                                 'bomb-to-number', [b]) or changed
            if b % 9 < 8:
                changed = reduce(b + 1, {v for v in domains[b + 1] if v > min(domains[b])},
                                 'bomb-to-number', [b]) or changed
        if not changed:
            break

    return {
        'finished': all(len(domain) == 1 for domain in domains),
        'numeric_remaining': sum(len(domains[i]) > 1 for i in numbers),
        'trace': trace,
    }


def load_demo():
    source = (Path(__file__).resolve().parents[1] / 'src/lib/bomb-sudoku.js').read_text()
    bombs = json.loads(re.search(r'export const bombs = (\[[^;]+\]);', source)[1])
    rows = re.search(r'export const givens = (\[.*?\n\]);', source, re.S)[1]
    givens = [n for row in json.loads(re.sub(r',\s*\]', ']', rows)) for n in row]
    if len(givens) != 81 or len(set(bombs)) != 9:
        raise ValueError('Expected 81 cells and nine distinct bomb positions')
    for unit in UNITS:
        if len(set(unit) & set(bombs)) != 1:
            raise ValueError('Each row, column and box must contain one bomb')
    if any(givens[b] for b in bombs):
        raise ValueError('This demo has no given bomb values')
    return givens, bombs


if __name__ == '__main__':
    givens, bombs = load_demo()
    report = grade(givens, bombs)
    classic = grade(givens, bombs, use_bombs=False)
    trace = report['trace']
    flows = {
        'neighbor_3_8_order': any(t['technique'] == 'bomb-order-pair'
                                  and t['before'] == [3, 8] for t in trace),
        'consecutive_neighbors_fix_bomb': any(t['technique'] == 'bomb-range'
                                              and len(t['after']) == 1 for t in trace),
        'used_values_fix_bomb': any(t['technique'] == 'bomb-used-values'
                                     and len(t['after']) == 1 for t in trace),
        'bomb_value_fixes_neighbor': any(t['technique'] == 'bomb-to-number'
                                          and len(t['after']) == 1 for t in trace),
    }
    print(json.dumps({
        'clues': sum(bool(n) for n in givens),
        'all_cells_determined_by_allowed_deductions': report['finished'],
        'technique_eliminations': dict(Counter(t['technique'] for t in trace)),
        'required_flows': flows,
        'without_bomb_comparisons_numeric_remaining': classic.get('numeric_remaining'),
        'branching': False,
    }, indent=2))
    if not report['finished'] or not all(flows.values()) or not classic.get('numeric_remaining'):
        raise SystemExit('The intended deduction flow needs revision')
