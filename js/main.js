/**
 * 主控制器 - 游戏流程控制
 * 管理状态机和各模块之间的协调
 */
const Main = (() => {
  // 游戏模式
  const MODE = {
    LOCAL: 'local',       // 本地双人
    AI_EASY: 'ai-easy',     // 人机简单（评分策略，无前瞻）
    AI_MEDIUM: 'ai-medium', // 人机中等（1层前瞻 minimax）
    ONLINE: 'online',     // 联机对战
  };

  let currentMode = null;
  let gameOver = false;
  let isMyTurn = true;      // 联机模式下是否是我方回合
  let onlinePlayerColor = null; // 联机中我方的颜色
  let aiThinking = false;   // AI 是否正在思考

  /** 初始化 */
  function init() {
    // UI 初始化，传入 Board 模块
    UI.init(Board);

    // 绑定 UI 落子回调
    UI.onMove(handlePlayerMove);

    // 绑定按钮事件
    bindButtons();

    // 绑定胜利弹窗按钮
    UI.getElement('btn-play-again').addEventListener('click', restartGame);
    UI.getElement('btn-to-menu').addEventListener('click', goToMenu);

    // 检查 URL 参数（联机房间号）
    checkURLParams();

    // 显示菜单
    UI.showScreen('menu');
    console.log('[Main] 五子棋已就绪');
  }

  /** 绑定所有按钮事件 */
  function bindButtons() {
    // 主菜单按钮
    UI.getElement('btn-local').addEventListener('click', () => startGame(MODE.LOCAL));
    UI.getElement('btn-ai-easy').addEventListener('click', () => startGame(MODE.AI_EASY));
    UI.getElement('btn-ai-medium').addEventListener('click', () => startGame(MODE.AI_MEDIUM));
    UI.getElement('btn-online').addEventListener('click', showOnlineScreen);

    // 游戏界面按钮
    UI.getElement('btn-back').addEventListener('click', confirmBack);
    UI.getElement('btn-restart').addEventListener('click', restartGame);

    // 联机界面按钮
    UI.getElement('btn-online-back').addEventListener('click', () => {
      P2P.disconnect();
      UI.showScreen('menu');
    });
    UI.getElement('btn-create-room').addEventListener('click', handleCreateRoom);
    UI.getElement('btn-join-room').addEventListener('click', handleJoinRoom);
    UI.getElement('btn-copy-room').addEventListener('click', handleCopyRoom);
  }

  /** 开始游戏 */
  function startGame(mode) {
    currentMode = mode;
    gameOver = false;
    aiThinking = false;
    Board.reset();
    UI.clearHighlight();
    UI.hideWin();
    UI.showScreen('game');
    // 界面可见后再计算 Canvas 尺寸（之前 display:none 导致 clientWidth=0）
    UI.resizeCanvas();

    if (mode === MODE.LOCAL) {
      isMyTurn = true;
      updateGameStatus();
    } else if (mode === MODE.AI_EASY || mode === MODE.AI_MEDIUM) {
      isMyTurn = true; // 玩家先手（黑棋）
      updateGameStatus();
    }
  }

  /** 更新游戏状态栏 */
  function updateGameStatus() {
    const player = Board.getCurrentPlayer();
    const playerName = player === Board.BLACK ? '黑棋' : '白棋';

    let extra = '';
    if (currentMode === MODE.LOCAL) {
      extra = ' — 本地双人';
    } else if (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM) {
      const diffName = currentMode === MODE.AI_EASY ? '简单' : '中等';
      if (aiThinking) {
        extra = ` — AI 思考中（${diffName}）`;
      } else {
        extra = ` — 你对 AI（${diffName}）`;
      }
    } else if (currentMode === MODE.ONLINE) {
      const youAre = onlinePlayerColor === Board.BLACK ? '黑棋' : '白棋';
      const turn = isMyTurn ? '你的回合' : '等待对手';
      extra = ` — 你执${youAre} · ${turn}`;
    }

    UI.updateStatus(player, playerName + extra);
  }

  /** 处理玩家落子 */
  function handlePlayerMove(x, y) {
    if (gameOver) return;
    if (aiThinking) return;

    // 联机模式：必须是我方回合
    if (currentMode === MODE.ONLINE && !isMyTurn) {
      UI.showToast('等待对手落子…');
      return;
    }

    // 本地或人机模式
    if (!tryPlaceStone(x, y)) return;

    // 联机模式发送坐标
    if (currentMode === MODE.ONLINE) {
      P2P.sendMove(x, y);
    }
  }

  /** 尝试落子并处理后续逻辑 */
  function tryPlaceStone(x, y) {
    if (!Board.placeStone(x, y)) return false;

    const player = Board.getCurrentPlayer();
    UI.setHighlight(x, y);

    // 检查胜负
    const winner = Board.checkWin(x, y);
    if (winner) {
      gameOver = true;
      setTimeout(() => {
        const isOnline = currentMode === MODE.ONLINE;
        UI.showWin(winner, isOnline);
      }, 300);
      return true;
    }

    // 检查平局
    if (Board.isDraw()) {
      gameOver = true;
      setTimeout(() => UI.showWin(null, false), 300);
      return true;
    }

    // 切换玩家
    Board.switchPlayer();
    updateGameStatus();

    // AI 模式：触发 AI 落子
    if (!gameOver && (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM)) {
      aiThinking = true;
      const difficulty = currentMode === MODE.AI_EASY ? 'normal' : 'hard';
      // 延迟 1 秒再落子，模拟人类思考节奏
      setTimeout(() => {
        const move = AI.getMove(Board, difficulty);
        if (move) {
          Board.placeStone(move.x, move.y);
          UI.setHighlight(move.x, move.y);

          const aiWinner = Board.checkWin(move.x, move.y);
          if (aiWinner) {
            gameOver = true;
            setTimeout(() => UI.showWin(aiWinner, false), 300);
          } else if (Board.isDraw()) {
            gameOver = true;
            setTimeout(() => UI.showWin(null, false), 300);
          } else {
            Board.switchPlayer();
          }
        }
        updateGameStatus();
        aiThinking = false;
      }, 1000);
    }

    // 联机模式：切换回合
    if (currentMode === MODE.ONLINE) {
      isMyTurn = false;
      updateGameStatus();
    }

    return true;
  }

  /** 重新开始（notifyPeer=false 时不通知对方，避免接收端重启信号再次发送形成循环） */
  function restartGame(notifyPeer = true) {
    if (currentMode === MODE.ONLINE && notifyPeer) {
      P2P.sendRestart();
    }

    gameOver = false;
    aiThinking = false;
    Board.reset();
    UI.clearHighlight();
    UI.hideWin();

    if (currentMode === MODE.ONLINE) {
      isMyTurn = (onlinePlayerColor === Board.BLACK); // 黑棋先手
    } else {
      isMyTurn = true;
    }

    updateGameStatus();
    UI.showScreen('game');
  }

  /** 返回菜单确认 */
  function confirmBack() {
    if (currentMode === MODE.ONLINE) {
      P2P.disconnect();
    }
    gameOver = false;
    aiThinking = false;
    Board.reset();
    UI.clearHighlight();
    UI.hideWin();
    UI.showScreen('menu');
  }

  function goToMenu() {
    if (currentMode === MODE.ONLINE) {
      P2P.disconnect();
    }
    gameOver = false;
    aiThinking = false;
    Board.reset();
    UI.clearHighlight();
    UI.hideWin();
    UI.showScreen('menu');
  }

  // ========== 联机相关 ==========

  /** 显示联机界面 */
  function showOnlineScreen() {
    UI.hideRoomInfo();
    UI.showScreen('online');
    UI.getElement('input-room-id').value = '';
    UI.getElement('join-error').classList.add('hidden');

    // 初始化 P2P
    P2P.init({
      onConnected: onP2PConnected,
      onDisconnected: onP2PDisconnected,
      onMove: onP2PMove,
      onError: onP2PError,
    });
  }

  /** 创建房间 */
  async function handleCreateRoom() {
    try {
      const btn = UI.getElement('btn-create-room');
      btn.disabled = true;
      btn.textContent = '创建中…';

      await P2P.createRoom();
      const roomId = P2P.getRoomId();
      UI.showRoomInfo(roomId);
      btn.textContent = '房间已创建';
    } catch (err) {
      console.error('[Main] 创建房间失败:', err);
      UI.showToast('创建房间失败，请重试');
      const btn = UI.getElement('btn-create-room');
      btn.disabled = false;
      btn.textContent = '创建房间';
    }
  }

  /** 加入房间 */
  async function handleJoinRoom() {
    const roomId = UI.getInputRoomId();
    if (!roomId) {
      UI.showJoinError('请输入房间号');
      return;
    }

    try {
      const btn = UI.getElement('btn-join-room');
      btn.disabled = true;
      btn.textContent = '连接中…';

      await P2P.joinRoom(roomId);
      btn.textContent = '已连接';
    } catch (err) {
      console.error('[Main] 加入房间失败:', err);
      UI.showJoinError(err.message || '加入房间失败');
      const btn = UI.getElement('btn-join-room');
      btn.disabled = false;
      btn.textContent = '加入';
    }
  }

  /** 复制房间号 */
  function handleCopyRoom() {
    const roomId = P2P.getRoomId();
    if (roomId && navigator.clipboard) {
      navigator.clipboard.writeText(roomId).then(() => {
        UI.showToast('房间号已复制！');
      }).catch(() => {
        UI.showToast('房间号：' + roomId);
      });
    }
  }

  /** P2P 连接成功 */
  function onP2PConnected() {
    const { isHost } = P2P.getStatus();

    // 房主执黑先手，加入者执白
    onlinePlayerColor = isHost ? Board.BLACK : Board.WHITE;
    isMyTurn = (onlinePlayerColor === Board.BLACK);

    currentMode = MODE.ONLINE;
    gameOver = false;
    Board.reset();
    UI.clearHighlight();
    UI.hideWin();
    UI.showScreen('game');
    UI.resizeCanvas();  // 界面可见后计算 Canvas 尺寸
    updateGameStatus();
    UI.showToast('连接成功！' + (isHost ? '你执黑先行' : '你执白，等待对手'));
  }

  /** P2P 断开连接 */
  function onP2PDisconnected() {
    if (currentMode === MODE.ONLINE && !gameOver) {
      UI.showToast('对手已断开连接', 3000);
      gameOver = true;
    }
  }

  /** P2P 收到落子 */
  function onP2PMove(x, y) {
    if (gameOver) return;

    // 处理重新开始信号（不通知对方，避免循环）
    if (x === 'restart') {
      restartGame(false);
      return;
    }

    // 对方落子
    if (!Board.placeStone(x, y)) return;

    UI.setHighlight(x, y);
    const winner = Board.checkWin(x, y);

    if (winner) {
      gameOver = true;
      setTimeout(() => UI.showWin(winner, true), 300);
      return;
    }

    if (Board.isDraw()) {
      gameOver = true;
      setTimeout(() => UI.showWin(null, true), 300);
      return;
    }

    Board.switchPlayer();
    isMyTurn = true;
    updateGameStatus();
  }

  /** P2P 错误 */
  function onP2PError(msg) {
    UI.showToast(msg, 4000);
  }

  /** 检查 URL 参数中的房间号 */
  function checkURLParams() {
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room) {
      UI.getElement('input-room-id').value = room;
      showOnlineScreen();
      // 自动加入
      setTimeout(() => handleJoinRoom(), 500);
    }
  }

  return { init };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  Main.init();
});
