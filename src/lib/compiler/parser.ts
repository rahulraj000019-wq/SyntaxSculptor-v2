/**
 * @fileOverview Syntax Analyzer (Recursive Descent Parser)
 * This module checks if the token stream conforms to the C-like grammar rules.
 * It provides local structural verification before AI semantic analysis.
 */

import { Lexer, Token, TokenType } from './lexer';

export interface SyntaxError {
  message: string;
  line: number;
  type: 'Syntax';
}

export class Parser {
  private lexer: Lexer;
  private currentToken: Token;
  private errors: SyntaxError[] = [];

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    this.currentToken = this.lexer.nextToken();
  }

  getErrors() {
    return this.errors;
  }

  parse() {
    this.program();
    return this.errors;
  }

  private consume() {
    this.currentToken = this.lexer.nextToken();
  }

  private match(expected: TokenType) {
    if (this.currentToken.type === expected) {
      this.consume();
      return true;
    } else {
      const found = this.currentToken.type === 'EOF' ? 'end of file' : `'${this.currentToken.value}'`;
      this.error(`Grammar violation: Expected ${expected}, but found ${found}`);
      return false;
    }
  }

  private error(message: string) {
    this.errors.push({
      type: 'Syntax',
      line: this.currentToken.line,
      message,
    });
    this.panicMode();
  }

  private panicMode() {
    // Synchronization strategy: Skip tokens until a statement boundary
    while (
      this.currentToken.type !== 'SEMICOLON' &&
      this.currentToken.type !== 'RBRACE' &&
      this.currentToken.type !== 'EOF'
    ) {
      this.consume();
    }
    if (this.currentToken.type === 'SEMICOLON') this.consume();
  }

  private program() {
    while (this.currentToken.type !== 'EOF') {
      if (this.currentToken.type === 'PREPROCESSOR') {
        this.consume();
      } else {
        this.statement();
      }
    }
  }

  private statement() {
    switch (this.currentToken.type) {
      case 'INT':
      case 'FLOAT':
      case 'DOUBLE':
      case 'CHAR':
      case 'VOID':
        this.declarationOrFunction();
        break;
      case 'ID':
        this.assignmentOrCall();
        break;
      case 'IF':
        this.ifStmt();
        break;
      case 'WHILE':
        this.whileStmt();
        break;
      case 'RETURN':
        this.returnStmt();
        break;
      default:
        this.error(`Unexpected start of statement: '${this.currentToken.value}'`);
        this.consume();
    }
  }

  private declarationOrFunction() {
    this.consume(); // type
    this.match('ID');
    
    if (this.currentToken.type === 'LPAREN') {
      // Function Definition
      this.consume();
      // Simple param list (ignoring types for this educational parser)
      while (!['RPAREN', 'EOF'].includes(this.currentToken.type)) {
        this.consume();
      }
      this.match('RPAREN');
      this.match('LBRACE');
      this.statementList();
      this.match('RBRACE');
    } else {
      // Variable Declaration
      this.match('SEMICOLON');
    }
  }

  private statementList() {
    while (
      this.currentToken.type !== 'RBRACE' && 
      this.currentToken.type !== 'EOF'
    ) {
      this.statement();
    }
  }

  private assignmentOrCall() {
    this.match('ID');
    if (this.currentToken.type === 'ASSIGN') {
      this.consume();
      this.expression();
    } else if (this.currentToken.type === 'LPAREN') {
      this.consume();
      while (!['RPAREN', 'EOF'].includes(this.currentToken.type)) {
        this.consume();
      }
      this.match('RPAREN');
    }
    this.match('SEMICOLON');
  }

  private ifStmt() {
    this.match('IF');
    this.match('LPAREN');
    this.expression();
    this.match('RPAREN');
    this.match('LBRACE');
    this.statementList();
    this.match('RBRACE');
  }

  private whileStmt() {
    this.match('WHILE');
    this.match('LPAREN');
    this.expression();
    this.match('RPAREN');
    this.match('LBRACE');
    this.statementList();
    this.match('RBRACE');
  }

  private returnStmt() {
    this.match('RETURN');
    if (this.currentToken.type !== 'SEMICOLON') {
      this.expression();
    }
    this.match('SEMICOLON');
  }

  private expression() {
    this.term();
    while (this.currentToken.type === 'PLUS' || this.currentToken.type === 'MINUS') {
      this.consume();
      this.term();
    }
  }

  private term() {
    if (
      this.currentToken.type === 'ID' || 
      this.currentToken.type === 'NUMBER' || 
      this.currentToken.type === 'STRING'
    ) {
      this.consume();
    } else {
      this.error(`Expected operand, but found '${this.currentToken.value}'`);
    }
  }
}
