/**
 * 五子棋 · 验收脚本
 * 用法: node verify.js
 * 输出: verify-results.json
 */
const fs = require('fs');
const path = require('path');

const PROJECT = { name: '五子棋', version: null, entryFile: 'index.html' };
const results = { project: PROJECT.name, version: PROJECT.version, timestamp: new Date().toISOString(), checks: [], summary: { total: 0, passed: 0, failed: 0 } };
function addCheck(name, pass, data = {}) { results.checks.push({ name, pass, data }); results.summary.total++; if (pass) results.summary.passed++; else results.summary.failed++; }
function fail(msg) { console.error('[verify] ' + msg); fs.writeFileSync('verify-results.json', JSON.stringify(results, null, 2)); process.exit(1); }

// 收集所有JS代码（内联+外部文件）
function collectAllJS(html) {
  const scripts = [];
  const srcRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = srcRegex.exec(html)) !== null) {
    const src = m[1];
    if (src.startsWith('http')) continue;
    try { scripts.push(fs.readFileSync(src, 'utf-8')); console.log('[verify]   加载 ' + src); }
    catch (e) { console.log('[verify]   跳过 ' + src + ' (不存在)'); }
  }
  const inlineRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = inlineRegex.exec(html)) !== null) {
    const code = m[1].trim();
    if (code) scripts.push(code);
  }
  return scripts.join('\n');
}

// ====== 1. 入口文件检查 ======
console.log('[verify] 读取 ' + PROJECT.entryFile + '...');
let html;
try { html = fs.readFileSync(PROJECT.entryFile, 'utf-8'); } catch (e) { fail('无法读取: ' + e.message); }
PROJECT.version = html.match(/v(\d+\.\d+)/)?.[1] ? 'v' + html.match(/v(\d+\.\d+)/)[1] : 'unknown';
results.version = PROJECT.version;
addCheck('入口文件存在', true, { size_bytes: html.length, lines: html.split('\n').length });

// ====== 2. JS 语法检查 ======
console.log('[verify] 收集并检查JS语法...');
const allScripts = collectAllJS(html);
if (!allScripts) fail('未找到任何JS代码');
try { new Function(allScripts); addCheck('JS 语法正确', true, { code_size: allScripts.length }); }
catch (e) { addCheck('JS 语法正确', false, { line: e.lineNumber, message: e.message }); fail('JS 语法错误'); }

// ====== 3. 五子棋核心逻辑检查 ======
console.log('[verify] 检查五子棋核心逻辑...');
const codemarks = [];
if (allScripts.includes('checkWin') || allScripts.includes('checkFive') || allScripts.includes('isWin')) codemarks.push('胜负判定');
if (allScripts.includes('board') || allScripts.includes('Board')) codemarks.push('棋盘数据结构');
if (allScripts.includes('click') || allScripts.includes('tap')) codemarks.push('落子交互');
if (allScripts.includes('undo') || allScripts.includes('悔棋')) codemarks.push('悔棋');
if (allScripts.includes('reset') || allScripts.includes('restart') || allScripts.includes('newGame')) codemarks.push('重置功能');
addCheck('五子棋核心逻辑', codemarks.length >= 3, { found: codemarks });

// ====== 4. 测试文件语法 ======
const testFile = 'test-board.js';
const hasTest = fs.existsSync(testFile);
if (hasTest) {
  try {
    const testCode = fs.readFileSync(testFile, 'utf-8');
    new Function(testCode);
    addCheck('测试文件语法', true, { file: testFile, size: testCode.length });
  } catch (e) {
    addCheck('测试文件语法', false, { file: testFile, error: e.message });
  }
} else {
  addCheck('测试文件语法', false, { file: testFile, error: '不存在' });
}

// ====== 写入结果 ======
fs.writeFileSync('verify-results.json', JSON.stringify(results, null, 2));
console.log('[verify] ' + results.summary.passed + '/' + results.summary.total + ' 通过');
process.exit(results.summary.failed > 0 ? 1 : 0);
