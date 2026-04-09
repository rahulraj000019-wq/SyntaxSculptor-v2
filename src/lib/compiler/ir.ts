/**
 * @fileOverview Intermediate Representation (IR) Generator
 *
 * Generates a tiny three-address-code (TAC) style IR for a C-like subset.
 * Supported (best-effort):
 * - Variable declarations with optional initializer: `int x = 1 + 2;`
 * - Assignments: `x = y + 3 * z;`
 *
 * Notes:
 * - This is educational and intentionally lightweight.
 * - It operates on the token stream; it is not a full C frontend.
 */

import { Lexer, type Token, type TokenType } from './lexer';

export interface IRError {
  type: 'Logic';
  line: number;
  message: string;
}

export type IRArg = { kind: 'id' | 'num' | 'str' | 'tmp'; value: string };

export type IRInstruction =
  | { op: 'decl'; dest: string; ctype: string; line: number }
  | { op: 'assign'; dest: string; src: IRArg; line: number }
  | { op: 'binop'; dest: string; left: IRArg; operator: '+' | '-' | '*' | '/'; right: IRArg; line: number };

const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

function isOpToken(t: TokenType): t is 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' {
  return t === 'PLUS' || t === 'MINUS' || t === 'STAR' || t === 'SLASH';
}

function opTokenToSymbol(t: TokenType): '+' | '-' | '*' | '/' {
  switch (t) {
    case 'PLUS':
      return '+';
    case 'MINUS':
      return '-';
    case 'STAR':
      return '*';
    case 'SLASH':
      return '/';
    default:
      return '+';
  }
}

function tokenToArg(tok: Token): IRArg | null {
  if (tok.type === 'ID') return { kind: 'id', value: tok.value };
  if (tok.type === 'NUMBER') return { kind: 'num', value: tok.value };
  if (tok.type === 'STRING') return { kind: 'str', value: tok.value };
  return null;
}

function isTypeToken(t: TokenType) {
  return t === 'INT' || t === 'FLOAT' || t === 'DOUBLE' || t === 'CHAR' || t === 'VOID';
}

function typeTokenToString(t: TokenType) {
  switch (t) {
    case 'INT':
      return 'int';
    case 'FLOAT':
      return 'float';
    case 'DOUBLE':
      return 'double';
    case 'CHAR':
      return 'char';
    case 'VOID':
      return 'void';
    default:
      return 'unknown';
  }
}

export function generateIR(source: string): { instructions: IRInstruction[]; errors: IRError[] } {
  const lexer = new Lexer(source);
  const tokens: Token[] = [];
  while (true) {
    const t = lexer.nextToken();
    tokens.push(t);
    if (t.type === 'EOF') break;
  }

  const instructions: IRInstruction[] = [];
  const errors: IRError[] = [];
  let i = 0;
  let tmpId = 0;
  const newTmp = () => ({ kind: 'tmp' as const, value: `t${++tmpId}` });

  const peek = (o = 0) => tokens[i + o] ?? tokens[tokens.length - 1]!;
  const consume = () => tokens[i++]!;

  const pushErr = (line: number, message: string) => errors.push({ type: 'Logic', line, message });

  const skipToSemicolon = () => {
    while (peek().type !== 'SEMICOLON' && peek().type !== 'EOF') consume();
    if (peek().type === 'SEMICOLON') consume();
  };

  const parseExpressionUntilSemicolon = (): { arg: IRArg | null; line: number } => {
    // Shunting-yard: output as postfix token list.
    const out: Token[] = [];
    const ops: Token[] = [];
    const startLine = peek().line;

    while (peek().type !== 'SEMICOLON' && peek().type !== 'EOF') {
      const t = peek();

      if (t.type === 'LPAREN') {
        ops.push(consume());
        continue;
      }
      if (t.type === 'RPAREN') {
        consume();
        while (ops.length && ops[ops.length - 1]!.type !== 'LPAREN') out.push(ops.pop()!);
        if (ops.length && ops[ops.length - 1]!.type === 'LPAREN') ops.pop();
        continue;
      }

      if (t.type === 'ID' || t.type === 'NUMBER' || t.type === 'STRING') {
        out.push(consume());
        continue;
      }

      if (isOpToken(t.type)) {
        const sym = opTokenToSymbol(t.type);
        while (
          ops.length &&
          isOpToken(ops[ops.length - 1]!.type) &&
          PRECEDENCE[opTokenToSymbol(ops[ops.length - 1]!.type)] >= PRECEDENCE[sym]
        ) {
          out.push(ops.pop()!);
        }
        ops.push(consume());
        continue;
      }

      // Anything else (commas, braces, calls) - bail out for this statement.
      pushErr(t.line, `IR generation skipped: unsupported expression token '${t.value}'.`);
      return { arg: null, line: startLine };
    }

    while (ops.length) {
      const op = ops.pop()!;
      if (op.type !== 'LPAREN') out.push(op);
    }

    // Postfix evaluation to TAC.
    const stack: IRArg[] = [];
    for (const tok of out) {
      if (tok.type === 'ID' || tok.type === 'NUMBER' || tok.type === 'STRING') {
        const a = tokenToArg(tok);
        if (a) stack.push(a);
        continue;
      }
      if (isOpToken(tok.type)) {
        const right = stack.pop();
        const left = stack.pop();
        if (!left || !right) {
          pushErr(tok.line, 'IR generation failed: malformed expression.');
          return { arg: null, line: startLine };
        }
        const dest = newTmp();
        instructions.push({
          op: 'binop',
          dest: dest.value,
          left,
          operator: opTokenToSymbol(tok.type),
          right,
          line: tok.line,
        });
        stack.push(dest);
        continue;
      }
    }

    if (stack.length !== 1) {
      pushErr(startLine, 'IR generation failed: malformed expression.');
      return { arg: null, line: startLine };
    }

    return { arg: stack[0]!, line: startLine };
  };

  while (peek().type !== 'EOF') {
    const t = peek();

    if (t.type === 'PREPROCESSOR') {
      consume();
      continue;
    }

    if (isTypeToken(t.type)) {
      const typeTok = consume();
      const ctype = typeTokenToString(typeTok.type);
      const idTok = peek();
      if (idTok.type !== 'ID') {
        skipToSemicolon();
        continue;
      }
      consume(); // ID
      instructions.push({ op: 'decl', dest: idTok.value, ctype, line: idTok.line });

      if (peek().type === 'ASSIGN') {
        consume();
        const expr = parseExpressionUntilSemicolon();
        if (expr.arg) instructions.push({ op: 'assign', dest: idTok.value, src: expr.arg, line: idTok.line });
      }
      skipToSemicolon();
      continue;
    }

    if (t.type === 'ID' && peek(1).type === 'ASSIGN') {
      const idTok = consume(); // ID
      consume(); // ASSIGN
      const expr = parseExpressionUntilSemicolon();
      if (expr.arg) instructions.push({ op: 'assign', dest: idTok.value, src: expr.arg, line: idTok.line });
      skipToSemicolon();
      continue;
    }

    // skip other statements
    consume();
  }

  return { instructions, errors };
}

export function formatIR(instructions: IRInstruction[]) {
  const fmtArg = (a: IRArg) => a.value;

  return instructions
    .map((ins) => {
      switch (ins.op) {
        case 'decl':
          return `L${ins.line}: decl ${ins.ctype} ${ins.dest}`;
        case 'assign':
          return `L${ins.line}: ${ins.dest} = ${fmtArg(ins.src)}`;
        case 'binop':
          return `L${ins.line}: ${ins.dest} = ${fmtArg(ins.left)} ${ins.operator} ${fmtArg(ins.right)}`;
      }
    })
    .join('\n');
}

