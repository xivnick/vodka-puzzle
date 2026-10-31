// Follow only the currently known chain. Keep earlier glasses and derive later
// ones again after every edit so removed or changed inputs leave no stale marks.
export function traceGlasses(path, values) {
  const stops = [0];
  let distance = 0;
  while (distance < path.length) {
    const [r, c] = path[distance];
    const number = values[r * 9 + c];
    if (!number) break;
    distance += number;
    if (distance >= path.length) {
      if (distance > path.length) stops.push(distance % path.length);
      break;
    }
    stops.push(distance);
  }
  return { stops, distance };
}
