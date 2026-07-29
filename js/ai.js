/**
 * AI 对手模块
 * 简单模式：评分策略（进攻 + 防守评分，无前瞻）
 * 中等模式：1 层前瞻（评分策略 + 模拟对手最佳应对）
 */
const AI = (() => {
  // ========== 评分表 ==========
  const SCORE = {
    FIVE: 100000,      // 五连
    LIVE_FOUR: 10000,  // 活四（两端空）
    RUSH_FOUR: 5000,   // 冲四（一端堵）
    LIVE_THREE: 2000,  // 活三（两端空）
    SLEEP_THREE: 200,  // 眠三（一端堵）
    LIVE_TWO: 100,     // 活二
    SLEEP_TWO: 20,     // 眠二
  };

  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  /**
   * 简单模式：纯评分策略（无前瞻）
   * 遍历所有空位 → 计算 AI 进攻分 + 对手防守分×1.1 → 选最高分
   */
  function normalMove(board) {
    const emptyCells = board.getEmptyCells();
    if (emptyCells.length === 0) return null;

    const aiPlayer = board.getCurrentPlayer();
    const oppPlayer = aiPlayer === board.BLACK ? board.WHITE : board.BLACK;

    if (emptyCells.length === board.SIZE * board.SIZE) {
      const center = Math.floor(board.SIZE / 2);
      return { x: center, y: center };
    }

    let bestScore = -Infinity;
    let bestMoves = [];

    for (const { x, y } of emptyCells) {
      const attack = evaluatePoint(board, x, y, aiPlayer);
      const defense = evaluatePoint(board, x, y, oppPlayer);
      const total = attack + defense * 1.1;

      if (total > bestScore) {
        bestScore = total;
        bestMoves = [{ x, y }];
      } else if (Math.abs(total - bestScore) < 0.5) {
        bestMoves.push({ x, y });
      }
    }

    const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return { x: pick.x, y: pick.y };
  }

  /**
   * 中等模式：1 层前瞻
   *
   * 流程：
   * 1. 缩小搜索范围——只考虑已有棋子周围 2 格的空位（候选点）
   * 2. 对候选点用评分函数初筛，取前 15 个
   * 3. 对每个候选点，在真实棋盘上"模拟"落子后，评估对手最佳反击
   * 4. 净值 = 自己得分 - 对手反击分×0.7
   * 5. 选净值最高
   *
   * 为什么更强：会"看到"对手的反击，避免踩陷阱，优先制造对手无法同时防守的多重威胁
   */
  function hardMove(board) {
    const emptyCells = board.getEmptyCells();
    if (emptyCells.length === 0) return null;

    const aiPlayer = board.getCurrentPlayer();
    const oppPlayer = aiPlayer === board.BLACK ? board.WHITE : board.BLACK;
    const center = Math.floor(board.SIZE / 2);

    // 第一手：下中心
    if (emptyCells.length === board.SIZE * board.SIZE) {
      return { x: center, y: center };
    }

    // ---- 第一步：筛选候选点 ----
    let candidates = getCandidates(board);
    if (candidates.length === 0) {
      candidates = emptyCells.map(c => ({ x: c.x, y: c.y }));
    }

    // ---- 第二步：评分初筛，取前 15 ----
    const scored = candidates.map(({ x, y }) => {
      const attack = evaluatePoint(board, x, y, aiPlayer);
      const defense = evaluatePoint(board, x, y, oppPlayer);
      return { x, y, baseScore: attack + defense * 1.1 };
    });
    scored.sort((a, b) => b.baseScore - a.baseScore);
    const topN = scored.slice(0, 15);

    // ---- 第三步：1 层前瞻 ----
    let bestNet = -Infinity;
    let bestMoves = [];

    for (const { x, y, baseScore } of topN) {
      // 已经能五连的直接选
      if (baseScore >= SCORE.FIVE) {
        bestMoves.push({ x, y });
        bestNet = SCORE.FIVE;
        continue;
      }

      // ★ 关键：在真实棋盘上模拟落子
      // board.getState() 返回整个棋盘+历史+当前玩家的深拷贝
      // board.loadState() 可以完整恢复，保证模拟不影响真实对局
      const savedState = board.getState();
      board.placeStone(x, y);

      // 在"AI 已落子"的棋盘上，评估对手最佳反击
      let opponentBest = 0;
      const oppCandidates = getCandidates(board);

      // 对手候选点也按评分排序，只查前 10 个
      const oppScored = oppCandidates.map(c => ({
        ...c,
        s: evaluatePoint(board, c.x, c.y, oppPlayer),
      }));
      oppScored.sort((a, b) => b.s - a.s);

      for (const oc of oppScored.slice(0, 10)) {
        const oppScore = evaluatePoint(board, oc.x, oc.y, oppPlayer);
        opponentBest = Math.max(opponentBest, oppScore);
        if (opponentBest >= SCORE.FIVE) break; // 对手能赢，不用再查
      }

      // 恢复棋盘
      board.loadState(savedState);

      // 净值 = 自己得分 - 对手反击×0.7
      const netScore = baseScore - opponentBest * 0.7;

      if (netScore > bestNet) {
        bestNet = netScore;
        bestMoves = [{ x, y }];
      } else if (Math.abs(netScore - bestNet) < 0.5) {
        bestMoves.push({ x, y });
      }
    }

    const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return { x: pick.x, y: pick.y };
  }

  /**
   * 获取候选落子点：已有棋子周围 2 格以内的空位
   * 大幅缩小搜索范围（从 225 降至 ~30-60）
   */
  function getCandidates(board) {
    const SIZE = board.SIZE;
    const seen = new Set();
    const candidates = [];

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board.get(x, y) !== board.EMPTY) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              const key = ny * SIZE + nx;
              if (
                nx >= 0 && nx < SIZE &&
                ny >= 0 && ny < SIZE &&
                !seen.has(key) &&
                board.get(nx, ny) === board.EMPTY
              ) {
                seen.add(key);
                candidates.push({ x: nx, y: ny });
              }
            }
          }
        }
      }
    }
    return candidates;
  }

  /**
   * 评估某玩家在 (x, y) 落子的威胁值
   * 汇总四个方向的棋型分数
   */
  function evaluatePoint(board, x, y, player) {
    let total = 0;
    for (const [dx, dy] of DIRECTIONS) {
      total += evaluateLine(board, x, y, dx, dy, player);
    }
    return total;
  }

  /**
   * 评估单个方向上的棋型
   * 向正反方向各数 5 格，统计连续同色棋子 + 端点是否为空 → 判断棋型分数
   */
  function evaluateLine(board, x, y, dx, dy, player) {
    const SIZE = board.SIZE;

    let posCount = 0, posOpen = false;
    let negCount = 0, negOpen = false;

    for (let i = 1; i <= 5; i++) {
      const cell = board.get(x + dx * i, y + dy * i);
      if (cell === player) posCount++;
      else { posOpen = (cell === board.EMPTY); break; }
    }

    for (let i = 1; i <= 5; i++) {
      const cell = board.get(x - dx * i, y - dy * i);
      if (cell === player) negCount++;
      else { negOpen = (cell === board.EMPTY); break; }
    }

    const total = posCount + negCount + 1;

    if (total >= 5) return SCORE.FIVE;
    if (total === 4 && posOpen && negOpen) return SCORE.LIVE_FOUR;
    if (total === 4 && (posOpen || negOpen)) return SCORE.RUSH_FOUR;
    if (total === 3 && posOpen && negOpen) return SCORE.LIVE_THREE;
    if (total === 3 && (posOpen || negOpen)) return SCORE.SLEEP_THREE;
    if (total === 2 && posOpen && negOpen) return SCORE.LIVE_TWO;
    if (total === 2 && (posOpen || negOpen)) return SCORE.SLEEP_TWO;

    return 0;
  }

  function getMove(board, difficulty) {
    if (difficulty === 'hard') return hardMove(board);
    return normalMove(board);
  }

  return { getMove };
})();
