/**
 * 五子棋核心逻辑测试 v1.0
 *
 * 使用 node 运行：node test-board.js
 * 验证 Board 模块的落子、胜负、悔棋、平局等关键逻辑
 */

// 模拟浏览器环境（Board 模块依赖全局变量）
global.window = global;
global.document = { addEventListener: () => {} };

// 加载 Board 模块
const fs = require('fs');
const path = require('path');
const boardCode = fs.readFileSync(path.join(__dirname, 'js', 'board.js'), 'utf8');
// Board.js 是 IIFE 赋值给 const Board，eval 里 const 不自动提升到全局
// 改为用 new Function 包装返回
const Board = new Function(boardCode + '; return Board;')();

const { BLACK, WHITE, EMPTY, SIZE } = Board;

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, ok: true });
  } catch (e) {
    failed++;
    results.push({ name, ok: false, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || '值不匹配'}: 期望 ${expected}, 实际 ${actual}`);
  }
}

// ===================== 基础落子测试 =====================

test('初始棋盘为空', () => {
  Board.reset();
  assertEqual(Board.get(7, 7), EMPTY, '中心点应为空');
  assertEqual(Board.getCurrentPlayer(), BLACK, '黑先');
});

test('落子成功', () => {
  Board.reset();
  assert(Board.placeStone(7, 7), '黑方应能落子');
  assertEqual(Board.get(7, 7), BLACK, '(7,7) 应为黑子');
});

test('不能在已有棋子的位置落子', () => {
  Board.reset();
  Board.placeStone(7, 7);
  assert(!Board.placeStone(7, 7), '同一位置不能重复落子');
});

test('不能超出棋盘边界', () => {
  Board.reset();
  assert(!Board.placeStone(-1, 0), 'x=-1 无效');
  assert(!Board.placeStone(0, SIZE), 'y=SIZE 无效');
  assert(!Board.placeStone(SIZE, 0), 'x=SIZE 无效');
});

test('玩家切换', () => {
  Board.reset();
  assertEqual(Board.getCurrentPlayer(), BLACK, '初始黑方');
  Board.placeStone(7, 7);
  Board.switchPlayer();
  assertEqual(Board.getCurrentPlayer(), WHITE, '切换后白方');
});

// ===================== 胜负判定测试 =====================

test('水平五连获胜', () => {
  Board.reset();
  // 黑: (3,7) (4,7) (5,7) (6,7) (7,7)
  for (let x = 3; x <= 7; x++) {
    Board.placeStone(x, 7);
    if (x < 7) Board.switchPlayer(); // 白方在其他位置落子
    if (x < 7) { Board.placeStone(x, 0); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(7, 7), BLACK, '水平五连应判断黑胜');
});

test('垂直五连获胜', () => {
  Board.reset();
  for (let y = 3; y <= 7; y++) {
    Board.placeStone(7, y);
    if (y < 7) Board.switchPlayer();
    if (y < 7) { Board.placeStone(0, y); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(7, 7), BLACK, '垂直五连应判断黑胜');
});

test('对角线 ↘ 五连获胜', () => {
  Board.reset();
  for (let i = 0; i < 5; i++) {
    Board.placeStone(3 + i, 3 + i);
    if (i < 4) Board.switchPlayer();
    if (i < 4) { Board.placeStone(0, i); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(7, 7), BLACK, '对角线五连应判断黑胜');
});

test('对角线 ↗ 五连获胜', () => {
  Board.reset();
  for (let i = 0; i < 5; i++) {
    Board.placeStone(3 + i, 7 - i);
    if (i < 4) Board.switchPlayer();
    if (i < 4) { Board.placeStone(0, i); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(7, 3), BLACK, '反对角线五连应判断黑胜');
});

test('四连不算获胜', () => {
  Board.reset();
  for (let x = 3; x <= 6; x++) {
    Board.placeStone(x, 7);
    if (x < 6) Board.switchPlayer();
    if (x < 6) { Board.placeStone(x, 0); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(6, 7), null, '四连不应获胜');
});

test('边界五连获胜', () => {
  Board.reset();
  for (let x = 0; x <= 4; x++) {
    Board.placeStone(x, 0);
    if (x < 4) Board.switchPlayer();
    if (x < 4) { Board.placeStone(x, 14); Board.switchPlayer(); }
  }
  assertEqual(Board.checkWin(4, 0), BLACK, '边界五连应判断黑胜');
});

// ===================== 悔棋测试 =====================

test('悔棋（undoOne）撤回一手', () => {
  Board.reset();
  Board.placeStone(7, 7);
  Board.switchPlayer();
  Board.placeStone(8, 8);
  Board.undoOne();
  assertEqual(Board.get(8, 8), EMPTY, '白子应被撤回');
  assertEqual(Board.getCurrentPlayer(), WHITE, '当前玩家应恢复为白方');
  assertEqual(Board.getState().history.length, 1, '历史应剩1步');
});

test('悔棋（undo）撤回两手（AI模式）', () => {
  Board.reset();
  Board.placeStone(7, 7); // 黑
  Board.switchPlayer();
  Board.placeStone(8, 8); // 白
  Board.switchPlayer();
  Board.undo(); // 应撤回白和黑各一手
  assertEqual(Board.get(7, 7), EMPTY, '黑子应被撤回');
  assertEqual(Board.get(8, 8), EMPTY, '白子应被撤回');
  assertEqual(Board.getCurrentPlayer(), BLACK, '当前玩家应恢复为黑方');
  assertEqual(Board.getState().history.length, 0, '历史应为空');
});

test('空棋盘悔棋不报错', () => {
  Board.reset();
  assertEqual(Board.undoOne(), null, '空棋盘悔棋返回 null');
  assertEqual(Board.undo(), null, '空棋盘悔棋(undo)返回 null');
});

// ===================== 平局测试 =====================

test('空棋盘不是平局', () => {
  Board.reset();
  assert(!Board.isDraw(), '空棋盘不是平局');
});

test('棋盘满时是平局', () => {
  Board.reset();
  // 填满棋盘但避免五连
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // 交替放黑白避免五连（简单策略：按列交替）
      if (Board.getCurrentPlayer() === BLACK) {
        Board.placeStone(x, y);
      } else {
        Board.placeStone(x, y);
      }
      if (x < SIZE - 1 || y < SIZE - 1) Board.switchPlayer();
    }
  }
  assert(Board.isDraw(), '满棋盘应判断为平局');
  assertEqual(Board.getState().history.length, SIZE * SIZE, '历史应等于棋盘格数');
});

// ===================== 状态序列化测试 =====================

test('getState/loadState 往返一致', () => {
  Board.reset();
  Board.placeStone(7, 7);
  Board.switchPlayer();
  Board.placeStone(3, 3);

  const state = Board.getState();
  Board.reset(); // 清空
  Board.loadState(state);

  assertEqual(Board.get(7, 7), BLACK, '恢复后(7,7)应为黑子');
  assertEqual(Board.get(3, 3), WHITE, '恢复后(3,3)应为白子');
  assertEqual(Board.getCurrentPlayer(), WHITE, '恢复后当前玩家为白方');
  assertEqual(Board.getState().history.length, 2, '恢复后历史应为2步');
});

// ===================== 获取空位测试 =====================

test('空棋盘应返回 SIZE×SIZE 个空位', () => {
  Board.reset();
  assertEqual(Board.getEmptyCells().length, SIZE * SIZE, '应有225个空位');
});

test('落子后空位减少', () => {
  Board.reset();
  Board.placeStone(7, 7);
  assertEqual(Board.getEmptyCells().length, SIZE * SIZE - 1, '应有224个空位');
});

// ===================== 结果输出 =====================

console.log('\n═══════════════════════════════════');
console.log('  五子棋核心逻辑测试报告');
console.log('═══════════════════════════════════\n');

for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  console.log(`  ${icon} ${r.name}`);
  if (!r.ok) console.log(`     错误: ${r.error}`);
}

console.log(`\n───────────────────────────────────`);
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
if (failed === 0) {
  console.log('  🎉 全部通过！');
} else {
  console.log(`  ⚠️  ${failed} 个测试失败，需要修复`);
}
console.log('───────────────────────────────────\n');

process.exit(failed > 0 ? 1 : 0);
