/**
 * @fileOverview Semantic Analyzer (Local)
 *
 * Educational semantic checks for a small C-like subset:
 * - Tracks declarations in nested scopes (via braces).
 * - Reports use/assignment/call of undeclared identifiers.
 * - Reports redeclaration in the same scope.
 *
 * This intentionally stays lightweight and tolerant: it operates on tokens
 * rather than a full AST.
 */

import type { Token, TokenType } from './lexer';
import { Lexer } from './lexer';

export interface SemanticError {
  message: string;
  line: number;
  type: 'Semantic';
}

type CType = 'int' | 'float' | 'double' | 'char' | 'void';

type SymbolKind = 'var' | 'func';

interface SymbolInfo {
  kind: SymbolKind;
  ctype: CType;
  name: string;
  declaredAtLine: number;
}

function isTypeToken(t: TokenType): t is 'INT' | 'FLOAT' | 'DOUBLE' | 'CHAR' | 'VOID' {
  return t === 'INT' || t === 'FLOAT' || t === 'DOUBLE' || t === 'CHAR' || t === 'VOID';
}

function tokenTypeToCType(t: TokenType): CType | null {
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
      return null;
  }
}

class ScopeStack {
  private scopes: Array<Map<string, SymbolInfo>> = [new Map()];

  push() {
    this.scopes.push(new Map());
  }

  pop() {
    if (this.scopes.length > 1) this.scopes.pop();
  }

  declare(sym: SymbolInfo): { ok: true } | { ok: false; existing: SymbolInfo } {
    const current = this.scopes[this.scopes.length - 1]!;
    const existing = current.get(sym.name);
    if (existing) return { ok: false, existing };
    current.set(sym.name, sym);
    return { ok: true };
  }

  lookup(name: string): SymbolInfo | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const sym = this.scopes[i]!.get(name);
      if (sym) return sym;
    }
    return null;
  }
}

export class SemanticAnalyzer {
  private readonly lexer: Lexer;
  private readonly errors: SemanticError[] = [];

  constructor(source: string) {
    this.lexer = new Lexer(source);
  }

  getErrors() {
    return this.errors;
  }

  analyze() {
    const tokens: Token[] = [];
    while (true) {
      const tok = this.lexer.nextToken();
      tokens.push(tok);
      if (tok.type === 'EOF') break;
    }

    const scopes = new ScopeStack();
    let i = 0;

    const addError = (line: number, message: string) => {
      this.errors.push({ type: 'Semantic', line, message });
    };

    const peek = (offset = 0) => tokens[i + offset] ?? tokens[tokens.length - 1]!;
    const consume = () => tokens[i++]!;

    const skipToSemicolonOrBrace = () => {
      while (peek().type !== 'SEMICOLON' && peek().type !== 'LBRACE' && peek().type !== 'RBRACE' && peek().type !== 'EOF') {
        consume();
      }
    };

    const declareSymbol = (sym: SymbolInfo) => {
      const res = scopes.declare(sym);
      if (!res.ok) {
        addError(
          sym.declaredAtLine,
          `Redeclaration of '${sym.name}' in the same scope (previously declared at line ${res.existing.declaredAtLine}).`
        );
      }
    };

    const handleDeclaration = () => {
      const typeTok = consume(); // INT/FLOAT/...
      const ctype = tokenTypeToCType(typeTok.type);
      if (!ctype) return;

      // We allow: <type> <id> ( ... ) { ... }   function
      // Or:        <type> <id> [= ...] (, <id> [= ...])* ;
      // We'll scan a comma-separated declarator list until semicolon or function body start.

      if (peek().type !== 'ID') {
        // Parser will report syntax issues; semantic phase just bails out.
        skipToSemicolonOrBrace();
        return;
      }

      const firstId = consume(); // ID
      const name = firstId.value;

      if (peek().type === 'LPAREN') {
        // function declaration/definition
        declareSymbol({ kind: 'func', ctype, name, declaredAtLine: firstId.line });
        // skip params
        consume(); // LPAREN
        while (peek().type !== 'RPAREN' && peek().type !== 'EOF') consume();
        if (peek().type === 'RPAREN') consume();

        // if function has a body, next should be LBRACE; scope handled by main loop.
        return;
      }

      // variable declaration list
      declareSymbol({ kind: 'var', ctype, name, declaredAtLine: firstId.line });

      // consume remainder of the declarator list to ';'
      // If the user forgets a semicolon, we must not consume into later statements
      // (e.g. function calls with commas) and misinterpret identifiers as redeclarations.
      while (
        peek().type !== 'SEMICOLON' &&
        peek().type !== 'EOF' &&
        peek().type !== 'RBRACE' &&
        peek().type !== 'LBRACE'
      ) {
        if (peek().type === 'COMMA') {
          consume(); // ,
          if (peek().type === 'ID') {
            const idTok = consume();
            declareSymbol({ kind: 'var', ctype, name: idTok.value, declaredAtLine: idTok.line });
            continue;
          } else {
            skipToSemicolonOrBrace();
            break;
          }
        } else {
          // initializer/expression tokens, ignore
          consume();
        }
      }
      if (peek().type === 'SEMICOLON') consume();
    };

    const handleIdentifierUse = () => {
      const idTok = consume(); // ID
      const name = idTok.value;

      // Declaration contexts are handled separately (when prior token is a type keyword).
      // Here we handle uses: assignment, call, or bare usage in expressions.
      const next = peek();

      if (next.type === 'LPAREN') {
        const sym = scopes.lookup(name);
        if (!sym) {
          addError(idTok.line, `Call to undeclared function '${name}'.`);
        } else if (sym.kind !== 'func') {
          addError(idTok.line, `'${name}' is not a function (declared as ${sym.kind}).`);
        }
        // Skip call tokens up to ')'
        consume(); // LPAREN
        while (peek().type !== 'RPAREN' && peek().type !== 'EOF') {
          // Detect nested identifier uses inside args
          if (peek().type === 'ID') {
            const inner = peek();
            const innerSym = scopes.lookup(inner.value);
            if (!innerSym) addError(inner.line, `Use of undeclared identifier '${inner.value}'.`);
          }
          consume();
        }
        if (peek().type === 'RPAREN') consume();
        return;
      }

      const sym = scopes.lookup(name);
      if (!sym) {
        addError(idTok.line, `Use of undeclared identifier '${name}'.`);
        return;
      }

      if (next.type === 'ASSIGN' && sym.kind !== 'var') {
        addError(idTok.line, `Cannot assign to '${name}' because it is not a variable.`);
      }
    };

    while (peek().type !== 'EOF') {
      const tok = peek();

      if (tok.type === 'PREPROCESSOR') {
        consume();
        continue;
      }

      if (tok.type === 'LBRACE') {
        scopes.push();
        consume();
        continue;
      }

      if (tok.type === 'RBRACE') {
        scopes.pop();
        consume();
        continue;
      }

      if (isTypeToken(tok.type)) {
        handleDeclaration();
        continue;
      }

      if (tok.type === 'ID') {
        handleIdentifierUse();
        continue;
      }

      consume();
    }

    return this.errors;
  }
}

