/** Names known to the expression validator. Implementations live in scope.ts. */

export const BUILTIN_FUNCTIONS = new Set([
  'min',
  'max',
  'clamp',
  'round',
  'floor',
  'ceil',
  'abs',
  'rnd',
  'randInt',
  'has',
  'qty',
  'itemAge',
  'best',
  'degree',
  'degreeCount',
  'degreePoints',
  'enrolled',
  'progress',
  'jobIs',
  'jobLevel',
  'jobCareer',
  'jobWage',
  'jobLocation',
  'weeksInJob',
  'canWork',
  'statMax',
  'itemsValue',
  'homeIs',
  'ownedBy',
  'flag',
  'turns',
  'hint',
]);

/** Plain identifiers that resolve to player fields (besides stats). */
export const PLAYER_FIELDS = new Set(['job', 'home', 'node', 'location', 'timeLeft', 'name', 'week', 'turnsTaken']);

/** Local variables the engine provides in specific contexts (see docs/CONTENT-GUIDE.md). */
export const KNOWN_LOCALS = new Set([
  'price',
  'item',
  'cost',
  'hours',
  'wage',
  'pay',
  'fee',
  'gain',
  'course',
  'lessons',
  'lessonsDone',
  'amount',
  'distance',
  'age',
  'jobId',
]);
