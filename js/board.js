/**
 * 棋盘逻辑模块
 * 15×15 棋盘，0=空 1=黑 2=白
 */
const Board = (() => {
  const SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  let grid = [];
  let history = [];  // 落子历史 [{x, y, player}]
  let currentPlayer = BLACK;  // 黑先

  /** 初始化空棋盘 */
  function init() {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    history = [];
    currentPlayer = BLACK;
  }

  /** 获取棋盘大小 */
  function getSize() {
    return SIZE;
  }

  /** 获取当前玩家 */
  function getCurrentPlayer() {
    return currentPlayer;
  }

  /** 获取指定位置的棋子 */
  function get(x, y) {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
    return grid[y][x];
  }

  /** 落子，返回是否合法 */
  function placeStone(x, y) {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return false;
    if (grid[y][x] !== EMPTY) return false;

    grid[y][x] = currentPlayer;
    history.push({ x, y, player: currentPlayer });
    return true;
  }

  /** 切换玩家 */
  function switchPlayer() {
    currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
  }

  /** 悔棋（撤销当前玩家的上一手） */
  function undo() {
    if (history.length === 0) return null;
    // 双方各悔一手
    const last = history.pop();
    grid[last.y][last.x] = EMPTY;
    if (history.length > 0) {
      const prev = history.pop();
      grid[prev.y][prev.x] = EMPTY;
      currentPlayer = prev.player;
    } else {
      currentPlayer = BLACK;
    }
    return last;
  }

  /**
   * 检查在 (x, y) 落子后是否获胜
   * 返回获胜方玩家编号，或 null
   */
  function checkWin(x, y) {
    const player = grid[y][x];
    if (player === EMPTY) return null;

    // 四个方向：[dx, dy]
    const directions = [
      [1, 0],   // 水平
      [0, 1],   // 垂直
      [1, 1],   // 对角线 ↘
      [1, -1],  // 对角线 ↗
    ];

    for (const [dx, dy] of directions) {
      let count = 1;

      // 正方向计数
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && grid[ny][nx] === player) {
          count++;
        } else break;
      }

      // 反方向计数
      for (let i = 1; i < 5; i++) {
        const nx = x - dx * i;
        const ny = y - dy * i;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && grid[ny][nx] === player) {
          count++;
        } else break;
      }

      if (count >= 5) return player;
    }

    return null;
  }

  /** 检查是否平局（棋盘满） */
  function isDraw() {
    return history.length >= SIZE * SIZE;
  }

  /** 获取全部可落子的空位 */
  function getEmptyCells() {
    const cells = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (grid[y][x] === EMPTY) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  /** 重置棋盘 */
  function reset() {
    init();
  }

  /** 获取当前棋盘状态（用于序列化） */
  function getState() {
    return {
      grid: grid.map(row => [...row]),
      currentPlayer,
      history: history.map(h => ({ ...h })),
    };
  }

  /** 恢复棋盘状态 */
  function loadState(state) {
    grid = state.grid.map(row => [...row]);
    currentPlayer = state.currentPlayer;
    history = state.history.map(h => ({ ...h }));
  }

  init();

  return {
    SIZE, EMPTY, BLACK, WHITE,
    init, getSize, get, getCurrentPlayer,
    placeStone, switchPlayer, checkWin, isDraw,
    getEmptyCells, reset, undo,
    getState, loadState,
  };
})();
