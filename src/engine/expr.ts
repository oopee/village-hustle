/**
 * Tiny, safe expression language used by content files.
 *
 * Supports: numbers, 'strings', true/false, identifiers with dots (player.money,
 * params.foodPrice), function calls (has('bicycle')), unary ! and -, binary
 * + - * / % < <= > >= == != && ||, and the ternary  cond ? a : b.
 *
 * No access to JavaScript globals: identifiers and functions are resolved by the
 * ExprEnv supplied by the engine.
 */

export type Expr = string | number | boolean;

export type AstNode =
  | { t: 'lit'; v: number | string | boolean }
  | { t: 'id'; path: string[] }
  | { t: 'un'; op: '-' | '!'; a: AstNode }
  | { t: 'bin'; op: string; a: AstNode; b: AstNode }
  | { t: 'cond'; c: AstNode; a: AstNode; b: AstNode }
  | { t: 'call'; name: string; args: AstNode[] };

export interface ExprEnv {
  resolve(path: string[]): unknown;
  call(name: string, args: unknown[]): unknown;
}

export class ExprError extends Error {}

type Tok =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'end' };

const OPS2 = new Set(['&&', '||', '==', '!=', '<=', '>=']);
const OPS1 = new Set(['<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', ',', '.']);

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new ExprError(`Bad number '${src.slice(i, j)}' in "${src}"`);
      out.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      if (j >= src.length) throw new ExprError(`Unterminated string in "${src}"`);
      out.push({ k: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.has(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if (OPS1.has(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character '${c}' in "${src}"`);
  }
  out.push({ k: 'end' });
  return out;
}

class Parser {
  private i = 0;
  constructor(
    private toks: Tok[],
    private src: string,
  ) {}

  private peek(): Tok {
    return this.toks[this.i];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.k === 'op' && t.v === v;
  }
  private expect(v: string) {
    if (!this.isOp(v)) throw this.err(`Expected '${v}'`);
    this.i++;
  }
  private err(msg: string) {
    return new ExprError(`${msg} in expression "${this.src}"`);
  }

  parse(): AstNode {
    const n = this.ternary();
    if (this.peek().k !== 'end') throw this.err('Unexpected token');
    return n;
  }

  private ternary(): AstNode {
    const c = this.binary(0);
    if (this.isOp('?')) {
      this.i++;
      const a = this.ternary();
      this.expect(':');
      const b = this.ternary();
      return { t: 'cond', c, a, b };
    }
    return c;
  }

  private static LEVELS: string[][] = [
    ['||'],
    ['&&'],
    ['==', '!='],
    ['<', '<=', '>', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  private binary(level: number): AstNode {
    if (level >= Parser.LEVELS.length) return this.unary();
    let a = this.binary(level + 1);
    const ops = Parser.LEVELS[level];
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && ops.includes(t.v)) {
        this.i++;
        const b = this.binary(level + 1);
        a = { t: 'bin', op: t.v, a, b };
      } else return a;
    }
  }

  private unary(): AstNode {
    if (this.isOp('!')) {
      this.i++;
      return { t: 'un', op: '!', a: this.unary() };
    }
    if (this.isOp('-')) {
      this.i++;
      return { t: 'un', op: '-', a: this.unary() };
    }
    if (this.isOp('+')) {
      this.i++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): AstNode {
    const t = this.peek();
    if (t.k === 'num' || t.k === 'str') {
      this.i++;
      return { t: 'lit', v: t.v };
    }
    if (t.k === 'id') {
      this.i++;
      if (t.v === 'true') return { t: 'lit', v: true };
      if (t.v === 'false') return { t: 'lit', v: false };
      if (this.isOp('(')) {
        this.i++;
        const args: AstNode[] = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.ternary());
            if (this.isOp(',')) {
              this.i++;
              continue;
            }
            break;
          }
        }
        this.expect(')');
        return { t: 'call', name: t.v, args };
      }
      const path = [t.v];
      while (this.isOp('.')) {
        this.i++;
        const n = this.peek();
        if (n.k !== 'id') throw this.err("Expected name after '.'");
        this.i++;
        path.push(n.v);
      }
      return { t: 'id', path };
    }
    if (this.isOp('(')) {
      this.i++;
      const n = this.ternary();
      this.expect(')');
      return n;
    }
    throw this.err('Unexpected token');
  }
}

const cache = new Map<string, AstNode>();

export function compile(src: Expr): AstNode {
  if (typeof src !== 'string') return { t: 'lit', v: src };
  let n = cache.get(src);
  if (!n) {
    n = new Parser(tokenize(src), src).parse();
    cache.set(src, n);
  }
  return n;
}

export function truthy(v: unknown): boolean {
  return !!v;
}

export function toNum(v: unknown, ctx?: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new ExprError(`Expected a number but got ${JSON.stringify(v)}${ctx ? ` in "${ctx}"` : ''}`);
}

export function evaluate(n: AstNode, env: ExprEnv): unknown {
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'id':
      return env.resolve(n.path);
    case 'un': {
      const a = evaluate(n.a, env);
      return n.op === '!' ? !truthy(a) : -toNum(a);
    }
    case 'cond':
      return truthy(evaluate(n.c, env)) ? evaluate(n.a, env) : evaluate(n.b, env);
    case 'call':
      return env.call(
        n.name,
        n.args.map((x) => evaluate(x, env)),
      );
    case 'bin': {
      if (n.op === '&&') return truthy(evaluate(n.a, env)) ? truthy(evaluate(n.b, env)) : false;
      if (n.op === '||') return truthy(evaluate(n.a, env)) ? true : truthy(evaluate(n.b, env));
      const a = evaluate(n.a, env);
      const b = evaluate(n.b, env);
      switch (n.op) {
        case '==':
          return a === b;
        case '!=':
          return a !== b;
        case '+':
          if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
          return toNum(a) + toNum(b);
        case '-':
          return toNum(a) - toNum(b);
        case '*':
          return toNum(a) * toNum(b);
        case '/': {
          const d = toNum(b);
          return d === 0 ? 0 : toNum(a) / d;
        }
        case '%': {
          const d = toNum(b);
          return d === 0 ? 0 : toNum(a) % d;
        }
        case '<':
          return toNum(a) < toNum(b);
        case '<=':
          return toNum(a) <= toNum(b);
        case '>':
          return toNum(a) > toNum(b);
        case '>=':
          return toNum(a) >= toNum(b);
      }
      throw new ExprError(`Unknown operator ${n.op}`);
    }
  }
}

export function evalExpr(src: Expr, env: ExprEnv): unknown {
  return evaluate(compile(src), env);
}

export function evalNum(src: Expr, env: ExprEnv): number {
  const v = toNum(evalExpr(src, env), String(src));
  if (!Number.isFinite(v)) throw new ExprError(`Expression "${src}" did not produce a finite number`);
  return v;
}

export function evalBool(src: Expr, env: ExprEnv): boolean {
  return truthy(evalExpr(src, env));
}

/** Replaces {expr} placeholders in text. Numbers are rounded to integers. */
export function interpolate(text: string, env: ExprEnv): string {
  return text.replace(/\{([^{}]+)\}/g, (_, src: string) => {
    const v = evalExpr(src.trim(), env);
    if (typeof v === 'number') return String(Math.round(v));
    return String(v);
  });
}

/** Walks an AST, reporting identifiers and calls (used by the content validator). */
export function walk(n: AstNode, visit: (n: AstNode) => void): void {
  visit(n);
  switch (n.t) {
    case 'un':
      walk(n.a, visit);
      break;
    case 'bin':
      walk(n.a, visit);
      walk(n.b, visit);
      break;
    case 'cond':
      walk(n.c, visit);
      walk(n.a, visit);
      walk(n.b, visit);
      break;
    case 'call':
      n.args.forEach((a) => walk(a, visit));
      break;
  }
}
