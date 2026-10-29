/**
 * Safe Math Expression Parser for Currency Inputs
 *
 * Evaluates basic arithmetic expressions (+, -, *, /, parentheses)
 * without using eval() or Function().
 */

export interface ParseResult {
  /** The evaluated numeric result in major units (rupees), or null if invalid or incomplete */
  result: number | null;
  /** Evaluated integer minor units (paise), or null */
  paise: number | null;
  /** Whether the expression is a valid, fully resolved mathematical expression */
  isValid: boolean;
  /** Formatted string of the result (e.g. "290.00") */
  formatted: string | null;
  /** Error message if invalid */
  error: string | null;
}

type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MULTIPLY' | 'DIVIDE' | 'LPAREN' | 'RPAREN';

interface Token {
  type: TokenType;
  value: number | string;
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const clean = input.replace(/\s+/g, '');

  while (i < clean.length) {
    const char = clean[i];

    if (char === '+') {
      tokens.push({ type: 'PLUS', value: '+' });
      i++;
    } else if (char === '-') {
      tokens.push({ type: 'MINUS', value: '-' });
      i++;
    } else if (char === '*' || char === 'x' || char === 'X') {
      tokens.push({ type: 'MULTIPLY', value: '*' });
      i++;
    } else if (char === '/') {
      tokens.push({ type: 'DIVIDE', value: '/' });
      i++;
    } else if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
    } else if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
    } else if (/[0-9.]/.test(char)) {
      let numStr = '';
      let hasDot = false;
      while (i < clean.length && /[0-9.]/.test(clean[i])) {
        if (clean[i] === '.') {
          if (hasDot) return null; // duplicate decimal point
          hasDot = true;
        }
        numStr += clean[i];
        i++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) return null;
      tokens.push({ type: 'NUMBER', value: num });
    } else {
      // Invalid character
      return null;
    }
  }

  return tokens;
}

/**
 * Shunting-Yard algorithm & Reverse Polish Notation evaluator
 */
export function parseAmountExpression(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      result: null,
      paise: null,
      isValid: false,
      formatted: null,
      error: null,
    };
  }

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) {
    return {
      result: null,
      paise: null,
      isValid: false,
      formatted: null,
      error: 'Invalid characters in expression',
    };
  }

  // Precedence map
  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
  };

  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];
  let prevToken: Token | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'NUMBER') {
      outputQueue.push(token);
    } else if (token.type === 'PLUS' || token.type === 'MINUS' || token.type === 'MULTIPLY' || token.type === 'DIVIDE') {
      // Check for unary minus at beginning or after operator/lparen
      if (token.type === 'MINUS' && (!prevToken || prevToken.type === 'PLUS' || prevToken.type === 'MINUS' || prevToken.type === 'MULTIPLY' || prevToken.type === 'DIVIDE' || prevToken.type === 'LPAREN')) {
        // Unary minus: represented as (0 - x)
        outputQueue.push({ type: 'NUMBER', value: 0 });
      }

      const op1 = token.value as string;
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== 'LPAREN' &&
        precedence[operatorStack[operatorStack.length - 1].value as string] >= precedence[op1]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      let foundLparen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack.pop()!;
        if (top.type === 'LPAREN') {
          foundLparen = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundLparen) {
        return {
          result: null,
          paise: null,
          isValid: false,
          formatted: null,
          error: 'Mismatched parentheses',
        };
      }
    }
    prevToken = token;
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      return {
        result: null,
        paise: null,
        isValid: false,
        formatted: null,
        error: 'Mismatched parentheses',
      };
    }
    outputQueue.push(top);
  }

  // Evaluate RPN
  const evalStack: number[] = [];
  for (const token of outputQueue) {
    if (token.type === 'NUMBER') {
      evalStack.push(token.value as number);
    } else {
      if (evalStack.length < 2) {
        return {
          result: null,
          paise: null,
          isValid: false,
          formatted: null,
          error: 'Incomplete expression',
        };
      }
      const b = evalStack.pop()!;
      const a = evalStack.pop()!;
      let res = 0;
      switch (token.value) {
        case '+':
          res = a + b;
          break;
        case '-':
          res = a - b;
          break;
        case '*':
          res = a * b;
          break;
        case '/':
          if (b === 0) {
            return {
              result: null,
              paise: null,
              isValid: false,
              formatted: null,
              error: 'Division by zero',
            };
          }
          res = a / b;
          break;
      }
      evalStack.push(res);
    }
  }

  if (evalStack.length !== 1) {
    return {
      result: null,
      paise: null,
      isValid: false,
      formatted: null,
      error: 'Incomplete expression',
    };
  }

  const finalResult = evalStack[0];
  if (!isFinite(finalResult) || isNaN(finalResult)) {
    return {
      result: null,
      paise: null,
      isValid: false,
      formatted: null,
      error: 'Calculation overflow',
    };
  }

  // Rounded to 2 decimal places for currency
  const roundedRupees = Math.round(finalResult * 100) / 100;
  const paise = Math.round(roundedRupees * 100);

  return {
    result: roundedRupees,
    paise,
    isValid: true,
    formatted: roundedRupees.toFixed(2),
    error: null,
  };
}
