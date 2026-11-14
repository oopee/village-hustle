import { describe, expect, it } from 'vitest';
import { compile, evalBool, evalNum, evalExpr, ExprError, interpolate, type ExprEnv } from '../src/engine/expr';

const env: ExprEnv = {
  resolve(path) {
    const data: Record<string, unknown> = { money: 120, params: { price: 30 }, name: 'Aino' };
    let v: unknown = data;
    for (const k of path) v = (v as Record<string, unknown>)?.[k];
    if (v === undefined) throw new ExprError(`unknown ${path.join('.')}`);
    return v;
  },
  call(name, args) {
    if (name === 'max') return Math.max(...(args as number[]));
    if (name === 'has') return args[0] === 'bicycle';
    throw new ExprError(`unknown function ${name}`);
  },
};

describe('expression language', () => {
  it('follows operator precedence', () => {
    expect(evalNum('1 + 2 * 3', env)).toBe(7);
    expect(evalNum('(1 + 2) * 3', env)).toBe(9);
    expect(evalNum('-2 * -3', env)).toBe(6);
    expect(evalNum('7 % 4', env)).toBe(3);
  });

  it('resolves dotted identifiers and calls functions', () => {
    expect(evalNum('money - params.price', env)).toBe(90);
    expect(evalNum('max(1, money, 5)', env)).toBe(120);
    expect(evalBool("has('bicycle') && !has('car')", env)).toBe(true);
  });

  it('supports comparisons and the ternary operator', () => {
    expect(evalBool('money >= 100 || money < 0', env)).toBe(true);
    expect(evalNum('money > 500 ? 1 : money > 100 ? 2 : 3', env)).toBe(2);
    expect(evalExpr("name == 'Aino'", env)).toBe(true);
  });

  it('accepts plain numbers and booleans as expressions', () => {
    expect(evalNum(5, env)).toBe(5);
    expect(evalBool(true, env)).toBe(true);
  });

  it('interpolates {expressions} in text', () => {
    expect(interpolate('You have {money - params.price} left, {name}.', env)).toBe('You have 90 left, Aino.');
  });

  it('rejects malformed input', () => {
    expect(() => compile('1 +')).toThrow(ExprError);
    expect(() => compile('money ) 2')).toThrow(ExprError);
    expect(() => compile("'unterminated")).toThrow(ExprError);
  });

  it('cannot reach JavaScript globals', () => {
    expect(() => evalExpr('globalThis', env)).toThrow(ExprError);
    expect(() => evalExpr("constructor('return 1')", env)).toThrow(ExprError);
  });
});
