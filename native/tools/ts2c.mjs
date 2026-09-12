import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'native/generated');

const SOURCES = [
  'src/core/noise.ts',
  'src/core/palette.ts',
  'src/core/world.ts',
  'src/core/mesh.ts',
  'src/core/player.ts',
  'src/core/time.ts',
  'src/core/mobs.ts',
  'src/core/survival.ts',
];

const T_NUM = { kind: 'num' };
const T_BOOL = { kind: 'bool' };
const T_VOID = { kind: 'void' };

function evalConst(node, known) {
  const lookup = name => {
    const hit = known.find(item => item.name === name);
    if (!hit) throw new Error(`unknown const ${name}`);
    return hit.value;
  };
  const walk = expr => {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isIdentifier(expr)) return lookup(expr.text);
    if (ts.isParenthesizedExpression(expr)) return walk(expr.expression);
    if (ts.isPrefixUnaryExpression(expr)) {
      const value = walk(expr.operand);
      if (expr.operator === ts.SyntaxKind.MinusToken) return -value;
      if (expr.operator === ts.SyntaxKind.PlusToken) return value;
      throw new Error('unsupported const prefix ' + expr.getText());
    }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.expression.getText() === 'Math') {
      const args = expr.arguments.map(walk);
      const method = expr.expression.name.text;
      if (method === 'imul') return Math.imul(args[0] | 0, args[1] | 0);
      if (method === 'floor') return Math.floor(args[0]);
      if (method === 'abs') return Math.abs(args[0]);
      throw new Error('unsupported const Math.' + method);
    }
    if (ts.isBinaryExpression(expr)) {
      const left = walk(expr.left);
      const right = walk(expr.right);
      switch (expr.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken: return left + right;
        case ts.SyntaxKind.MinusToken: return left - right;
        case ts.SyntaxKind.AsteriskToken: return left * right;
        case ts.SyntaxKind.SlashToken: return left / right;
        case ts.SyntaxKind.AmpersandToken: return (left | 0) & (right | 0);
        case ts.SyntaxKind.BarToken: return (left | 0) | (right | 0);
        case ts.SyntaxKind.CaretToken: return (left | 0) ^ (right | 0);
        case ts.SyntaxKind.LessThanLessThanToken: return (left | 0) << (right | 0);
        case ts.SyntaxKind.GreaterThanGreaterThanToken: return (left | 0) >> (right | 0);
        case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return (left >>> 0) >>> (right | 0);
        default: throw new Error('unsupported const operator ' + expr.operatorToken.getText());
      }
    }
    throw new Error('unsupported const expression ' + expr.getText());
  };
  return walk(node);
}

function formatConst(value) {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

function cBase(type) {
  if (type.kind === 'num') return 'double';
  if (type.kind === 'bool') return 'int';
  if (type.kind === 'u8') return 'uint8_t *';
  if (type.kind === 'i32') return 'int32_t *';
  if (type.kind === 'f64') return 'double *';
  if (type.kind === 'cls') return `${type.name} *`;
  if (type.kind === 'void') return 'void';
  if (type.kind === 'intarr') return 'const int *';
  throw new Error(`unsupported type ${JSON.stringify(type)}`);
}

function annotationType(node, classes) {
  if (!node) return null;
  const text = node.getText ? node.getText() : String(node);
  if (text === 'number') return T_NUM;
  if (text === 'boolean') return T_BOOL;
  if (text === 'void') return T_VOID;
  if (text === 'Uint8Array') return { kind: 'u8' };
  if (text === 'Int32Array') return { kind: 'i32' };
  if (text === 'Float64Array') return { kind: 'f64' };
  if (classes.has(text)) return { kind: 'cls', name: text };
  return null;
}

class Emitter {
  constructor() {
    this.classes = new Map();
    this.functions = [];
    this.consts = [];
    this.arrays = [];
    this.body = [];
  }
}

function collect(sourceFile, em) {
  ts.forEachChild(sourceFile, node => {
    let decl = node;
    if (ts.isExportDeclaration(node)) return;
    if (node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) decl = node;
    if (ts.isClassDeclaration(decl)) {
      const name = decl.name.text;
      const fields = [];
      const methods = [];
      let ctor = null;
      for (const member of decl.members) {
        if (ts.isPropertyDeclaration(member)) {
          fields.push({ name: member.name.text, type: annotationType(member.type, em.classes) || T_NUM });
        } else if (ts.isConstructorDeclaration(member)) {
          ctor = member;
        } else if (ts.isMethodDeclaration(member)) {
          methods.push(member);
        }
      }
      em.classes.set(name, { name, fields, methods, ctor });
    } else if (ts.isFunctionDeclaration(decl) && decl.name) {
      em.functions.push(decl);
    } else if (ts.isVariableStatement(decl)) {
      for (const d of decl.declarationList.declarations) {
        const init = d.initializer;
        if (init && ts.isArrayLiteralExpression(init)) {
          em.arrays.push({ name: d.name.text, values: init.elements.map(e => e.getText()) });
        } else if (init) {
          const value = evalConst(init, em.consts);
          em.consts.push({ name: d.name.text, value: formatConst(value) });
        } else {
          throw new Error(`unsupported top-level const ${d.name.text}`);
        }
      }
    }
  });
}

function fnName(name) {
  return `sv_${name}`;
}

function translate(em) {
  const header = [];
  const impl = [];
  header.push('#ifndef SANDVOXEL_CORE_H');
  header.push('#define SANDVOXEL_CORE_H');
  header.push('#include <stdint.h>');
  header.push('');
  for (const c of em.consts) header.push(`#define ${c.name} ${c.value}`);
  header.push('');
  for (const cls of em.classes.values()) {
    header.push(`typedef struct ${cls.name} {`);
    for (const f of cls.fields) header.push(`    ${cBase(f.type)} ${f.name};`);
    header.push(`} ${cls.name};`);
    header.push('');
  }
  for (const cls of em.classes.values()) {
    const params = cls.ctor ? cls.ctor.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`) : [];
    header.push(`void ${cls.name}_ctor(${cls.name} * self${params.length ? ', ' : ''}${params.join(', ')});`);
    header.push(`${cls.name} * ${cls.name}_new(${params.join(', ')});`);
    for (const m of cls.methods) {
      const mp = m.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`);
      header.push(`${cBase(annotationType(m.type, em.classes) || T_VOID)} ${cls.name}_${m.name.text}(${cls.name} * self${mp.length ? ', ' : ''}${mp.join(', ')});`);
    }
    header.push('');
  }
  for (const f of em.functions) {
    const params = f.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`);
    header.push(`${cBase(annotationType(f.type, em.classes) || T_VOID)} ${fnName(f.name.text)}(${params.join(', ') || 'void'});`);
  }
  header.push('');
  header.push('#endif');

  impl.push('#include "sandvoxel_core.h"');
  impl.push('#include <math.h>');
  impl.push('#include <stdlib.h>');
  impl.push('#include <string.h>');
  impl.push('');
  for (const a of em.arrays) impl.push(`static const int ${a.name}[${a.values.length}] = { ${a.values.join(', ')} };`);
  if (em.arrays.length) impl.push('');

  const ctx = { em, locals: new Map(), className: null, out: [] };

  function localType(name) {
    return ctx.locals.get(name) || null;
  }

  function infer(expr) {
    if (expr.kind === ts.SyntaxKind.ThisKeyword) return { kind: 'cls', name: ctx.className };
    if (ts.isNumericLiteral(expr)) return T_NUM;
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) return T_BOOL;
    if (ts.isNewExpression(expr)) {
      const text = expr.expression.getText();
      if (text === 'Uint8Array') return { kind: 'u8' };
      if (text === 'Int32Array') return { kind: 'i32' };
      if (text === 'Float64Array') return { kind: 'f64' };
      return { kind: 'cls', name: text };
    }
    if (ts.isIdentifier(expr)) {
      if (localType(expr.text)) return localType(expr.text);
      const f = em.functions.find(item => item.name.text === expr.text);
      if (f) return annotationType(f.type, em.classes) || T_VOID;
      return T_NUM;
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const ownerType = infer(callee.expression);
        if (ownerType.kind === 'cls') {
          const cls = em.classes.get(ownerType.name);
          const m = cls.methods.find(item => item.name.text === callee.name.text);
          if (m) return annotationType(m.type, em.classes) || T_VOID;
        }
      } else if (ts.isIdentifier(callee)) {
        const f = em.functions.find(item => item.name.text === callee.text);
        if (f) return annotationType(f.type, em.classes) || T_VOID;
      }
      return T_NUM;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const ownerType = infer(expr.expression);
      if (ownerType.kind === 'cls') {
        const cls = em.classes.get(ownerType.name);
        const f = cls.fields.find(item => item.name === expr.name.text);
        if (f) return f.type;
      }
      return T_NUM;
    }
    if (ts.isElementAccessExpression(expr)) {
      const base = infer(expr.argumentExpression);
      if (base.kind === 'u8' || base.kind === 'i32' || base.kind === 'f64' || base.kind === 'intarr') return T_NUM;
      return T_NUM;
    }
    if (ts.isConditionalExpression(expr)) return infer(expr.whenTrue);
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (op >= ts.SyntaxKind.LessThanToken && op <= ts.SyntaxKind.GreaterThanEqualsToken) return T_BOOL;
      if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) return T_BOOL;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) return T_BOOL;
      return T_NUM;
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      if (expr.operator === ts.SyntaxKind.ExclamationToken) return T_BOOL;
      return T_NUM;
    }
    if (ts.isParenthesizedExpression(expr)) return infer(expr.expression);
    return T_NUM;
  }

  function intCast(text) {
    return `(int32_t)(${text})`;
  }

  function emitExpr(expr) {
    if (ts.isNumericLiteral(expr)) return expr.text;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return '1';
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return '0';
    if (ts.isParenthesizedExpression(expr)) return `(${emitExpr(expr.expression)})`;
    if (expr.kind === ts.SyntaxKind.ThisKeyword) return 'self';
    if (ts.isIdentifier(expr)) {
      if (expr.text === 'this') return 'self';
      return expr.text;
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      const inner = emitExpr(expr.operand);
      if (expr.operator === ts.SyntaxKind.PlusPlusToken) return `${inner}++`;
      if (expr.operator === ts.SyntaxKind.MinusMinusToken) return `${inner}--`;
      throw new Error('unsupported postfix ' + expr.getText());
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      const inner = emitExpr(expr.operand);
      if (expr.operator === ts.SyntaxKind.PlusPlusToken) return `++${inner}`;
      if (expr.operator === ts.SyntaxKind.MinusMinusToken) return `--${inner}`;
      if (expr.operator === ts.SyntaxKind.ExclamationToken) return `!${inner}`;
      if (expr.operator === ts.SyntaxKind.MinusToken) return `-${inner}`;
      if (expr.operator === ts.SyntaxKind.PlusToken) return `+${inner}`;
      throw new Error('unsupported prefix ' + expr.getText());
    }
    if (ts.isNewExpression(expr)) {
      const text = expr.expression.getText();
      const args = expr.arguments.map(emitExpr);
      if (text === 'Uint8Array') return `calloc(${args[0]}, 1)`;
      if (text === 'Int32Array') return `calloc(${args[0]}, sizeof(int32_t))`;
      if (text === 'Float64Array') return `calloc(${args[0]}, sizeof(double))`;
      return `${text}_new(${args.join(', ')})`;
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      const args = expr.arguments.map(emitExpr);
      if (ts.isPropertyAccessExpression(callee)) {
        const owner = callee.expression;
        const method = callee.name.text;
        if (ts.isIdentifier(owner) && owner.text === 'Math') return mathCall(method, args);
        const ownerType = infer(owner);
        if (ownerType.kind === 'cls') return `${ownerType.name}_${method}(${emitExpr(owner)}${args.length ? ', ' : ''}${args.join(', ')})`;
        throw new Error('unsupported call target ' + expr.getText());
      }
      if (ts.isIdentifier(callee)) return `${fnName(callee.text)}(${args.join(', ')})`;
      throw new Error('unsupported call ' + expr.getText());
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const owner = expr.expression;
      if (ts.isIdentifier(owner) && owner.text === 'Math') {
        if (expr.name.text === 'PI') return '3.141592653589793';
      }
      return `${emitExpr(owner)}->${expr.name.text}`;
    }
    if (ts.isElementAccessExpression(expr)) {
      return `${emitExpr(expr.expression)}[(int64_t)(${emitExpr(expr.argumentExpression)})]`;
    }
    if (ts.isConditionalExpression(expr)) {
      return `(${emitExpr(expr.condition)} ? ${emitExpr(expr.whenTrue)} : ${emitExpr(expr.whenFalse)})`;
    }
    if (ts.isBinaryExpression(expr)) {
      const left = emitExpr(expr.left);
      const right = emitExpr(expr.right);
      switch (expr.operatorToken.kind) {
        case ts.SyntaxKind.EqualsToken: return `${left} = ${right}`;
        case ts.SyntaxKind.PlusEqualsToken: return `${left} += ${right}`;
        case ts.SyntaxKind.MinusEqualsToken: return `${left} -= ${right}`;
        case ts.SyntaxKind.AsteriskEqualsToken: return `${left} *= ${right}`;
        case ts.SyntaxKind.SlashEqualsToken: return `${left} /= ${right}`;
        case ts.SyntaxKind.PlusToken: return `${left} + ${right}`;
        case ts.SyntaxKind.MinusToken: return `${left} - ${right}`;
        case ts.SyntaxKind.AsteriskToken: return `${left} * ${right}`;
        case ts.SyntaxKind.SlashToken: return `${left} / ${right}`;
        case ts.SyntaxKind.PercentToken: return `fmod(${left}, ${right})`;
        case ts.SyntaxKind.LessThanToken: return `${left} < ${right}`;
        case ts.SyntaxKind.LessThanEqualsToken: return `${left} <= ${right}`;
        case ts.SyntaxKind.GreaterThanToken: return `${left} > ${right}`;
        case ts.SyntaxKind.GreaterThanEqualsToken: return `${left} >= ${right}`;
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.EqualsEqualsEqualsToken: return `${left} == ${right}`;
        case ts.SyntaxKind.ExclamationEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: return `${left} != ${right}`;
        case ts.SyntaxKind.AmpersandAmpersandToken: return `${left} && ${right}`;
        case ts.SyntaxKind.BarBarToken: return `${left} || ${right}`;
        case ts.SyntaxKind.AmpersandToken: return `${intCast(left)} & ${intCast(right)}`;
        case ts.SyntaxKind.BarToken: return `${intCast(left)} | ${intCast(right)}`;
        case ts.SyntaxKind.CaretToken: return `${intCast(left)} ^ ${intCast(right)}`;
        case ts.SyntaxKind.LessThanLessThanToken: return `${intCast(left)} << ${intCast(right)}`;
        case ts.SyntaxKind.GreaterThanGreaterThanToken: return `${intCast(left)} >> ${intCast(right)}`;
        case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return `(int32_t)((uint32_t)${intCast(left)} >> ${intCast(right)})`;
        default: throw new Error('unsupported operator ' + expr.operatorToken.getText());
      }
    }
    throw new Error('unsupported expression ' + expr.getText());
  }

  function mathCall(method, args) {
    const map = {
      floor: 'floor', ceil: 'ceil', sin: 'sin', cos: 'cos', sqrt: 'sqrt',
      abs: 'fabs', max: 'fmax', min: 'fmin', round: 'round', atan2: 'atan2',
    };
    if (method === 'imul') return `(int32_t)((int64_t)${intCast(args[0])} * (int64_t)${intCast(args[1])})`;
    if (!map[method]) throw new Error('unsupported Math.' + method);
    return `${map[method]}(${args.join(', ')})`;
  }

  function emitStmt(stmt, indent) {
    const pad = '    '.repeat(indent);
    if (ts.isBlock(stmt)) {
      for (const s of stmt.statements) emitStmt(s, indent);
      return;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const type = infer(d.initializer);
        ctx.locals.set(d.name.text, type);
        impl.push(`${pad}${cBase(type)} ${d.name.text} = ${emitExpr(d.initializer)};`);
      }
      return;
    }
    if (ts.isIfStatement(stmt)) {
      impl.push(`${pad}if (${emitExpr(stmt.expression)}) {`);
      emitStmt(stmt.thenStatement, indent + 1);
      impl.push(`${pad}}`);
      if (stmt.elseStatement) {
        if (ts.isIfStatement(stmt.elseStatement)) {
          impl.push(`${pad}else {`);
          emitStmt(stmt.elseStatement, indent + 1);
          impl.push(`${pad}}`);
        } else {
          impl.push(`${pad}else {`);
          emitStmt(stmt.elseStatement, indent + 1);
          impl.push(`${pad}}`);
        }
      }
      return;
    }
    if (ts.isForStatement(stmt)) {
      const init = stmt.initializer;
      let head = '';
      if (init && ts.isVariableDeclarationList(init)) {
        const d = init.declarations[0];
        const type = infer(d.initializer);
        ctx.locals.set(d.name.text, type);
        head = `${cBase(type)} ${d.name.text} = ${emitExpr(d.initializer)}`;
      }
      const cond = stmt.condition ? emitExpr(stmt.condition) : '';
      const incr = stmt.incrementor ? emitExpr(stmt.incrementor) : '';
      impl.push(`${pad}for (${head}; ${cond}; ${incr}) {`);
      emitStmt(stmt.statement, indent + 1);
      impl.push(`${pad}}`);
      return;
    }
    if (ts.isWhileStatement(stmt)) {
      impl.push(`${pad}while (${emitExpr(stmt.expression)}) {`);
      emitStmt(stmt.statement, indent + 1);
      impl.push(`${pad}}`);
      return;
    }
    if (stmt.kind === ts.SyntaxKind.ContinueStatement) {
      impl.push(`${pad}continue;`);
      return;
    }
    if (stmt.kind === ts.SyntaxKind.BreakStatement) {
      impl.push(`${pad}break;`);
      return;
    }
    if (ts.isReturnStatement(stmt)) {
      impl.push(stmt.expression ? `${pad}return ${emitExpr(stmt.expression)};` : `${pad}return;`);
      return;
    }
    if (ts.isExpressionStatement(stmt)) {
      impl.push(`${pad}${emitExpr(stmt.expression)};`);
      return;
    }
    throw new Error('unsupported statement ' + stmt.getText().slice(0, 80));
  }

  function emitBody(body) {
    impl.push('{');
    emitStmt(body, 1);
    impl.push('}');
  }

  for (const cls of em.classes.values()) {
    ctx.className = cls.name;
    ctx.locals = new Map();
    for (const f of cls.fields) ctx.locals.set(f.name, f.type);
    if (cls.ctor) {
      const params = cls.ctor.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`);
      for (const p of cls.ctor.parameters) ctx.locals.set(p.name.text, annotationType(p.type, em.classes) || T_NUM);
      impl.push(`void ${cls.name}_ctor(${cls.name} * self${params.length ? ', ' : ''}${params.join(', ')})`);
      emitBody(cls.ctor.body);
      impl.push('');
      impl.push(`${cls.name} * ${cls.name}_new(${params.join(', ')})`);
      impl.push('{');
      impl.push(`    ${cls.name} * self = calloc(1, sizeof(${cls.name}));`);
      const argNames = cls.ctor.parameters.map(p => p.name.text);
      impl.push(`    ${cls.name}_ctor(self${argNames.length ? ', ' : ''}${argNames.join(', ')});`);
      impl.push('    return self;');
      impl.push('}');
      impl.push('');
    }
    for (const m of cls.methods) {
      const mp = m.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`);
      ctx.locals = new Map();
      for (const f of cls.fields) ctx.locals.set(f.name, f.type);
      for (const p of m.parameters) ctx.locals.set(p.name.text, annotationType(p.type, em.classes) || T_NUM);
      impl.push(`${cBase(annotationType(m.type, em.classes) || T_VOID)} ${cls.name}_${m.name.text}(${cls.name} * self${mp.length ? ', ' : ''}${mp.join(', ')})`);
      emitBody(m.body);
      impl.push('');
    }
  }
  ctx.className = null;
  for (const f of em.functions) {
    const params = f.parameters.map(p => `${cBase(annotationType(p.type, em.classes) || T_NUM)} ${p.name.text}`);
    ctx.locals = new Map();
    for (const p of f.parameters) ctx.locals.set(p.name.text, annotationType(p.type, em.classes) || T_NUM);
    impl.push(`${cBase(annotationType(f.type, em.classes) || T_VOID)} ${fnName(f.name.text)}(${params.join(', ') || 'void'})`);
    emitBody(f.body);
    impl.push('');
  }

  return { header: header.join('\n') + '\n', impl: impl.join('\n') + '\n' };
}

const em = new Emitter();
for (const rel of SOURCES) {
  const file = path.join(root, rel);
  const source = ts.createSourceFile(rel, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  collect(source, em);
}

const { header, impl } = translate(em);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sandvoxel_core.h'), header);
fs.writeFileSync(path.join(outDir, 'sandvoxel_core.c'), impl);
console.log(`generated native/generated/sandvoxel_core.{h,c}: ${em.classes.size} classes, ${em.functions.length} functions, ${impl.split('\n').length} lines`);
