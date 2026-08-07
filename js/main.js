/**
 * 主控制器 —— 游戏流程、计时器、悔棋、重来
 *
 * 计时规则：每步 60 秒，超时判负。最后 20 秒红闪警告。
 * 使用 Date.now() 计算实际流逝时间，避免 setInterval 漂移。
 */
const Main = (() => {
  const MOVE_TIME = 60; // 秒（每步限时）

  const MODE = {
    LOCAL: 'local',
    AI_EASY: 'ai-easy',
    AI_MEDIUM: 'ai-medium',
    ONLINE: 'online',
  };

  let currentMode = null;
  let gameOver = false;
  let isMyTurn = true;
  let onlinePlayerColor = null;
  let aiThinking = false;

  // 计时器
  let timerDeadline = 0;    // 当前回合到期时间戳 (Date.now() + MOVE_TIME*1000)
  let timerInterval = null;
  let timerPlayer = null;   // 当前计时的玩家

  // 联机请求状态（防止重复弹窗）
  let pendingRequest = null; // 'undo' | 'rematch' | null

  // 屏幕唤醒锁（防止联机时后台被系统挂起）
  let wakeLock = null;
  let wakeLockSupported = false;

  /** 初始化 */
  function init() {
    UI.init(Board);
    UI.onMove(handlePlayerMove);
    bindButtons();
    UI.getElement('btn-play-again').addEventListener('click', handlePlayAgain);
    UI.getElement('btn-to-menu').addEventListener('click', goToMenu);
    UI.getElement('btn-request-accept').addEventListener('click', () => acceptRequest());
    UI.getElement('btn-request-reject').addEventListener('click', () => rejectRequest());

    // 检测 Wake Lock 支持
    wakeLockSupported = 'wakeLock' in navigator;
    // 页面可见性变化检测（后台切前台时检查连接状态）
    document.addEventListener('visibilitychange', onVisibilityChange);

    checkURLParams();
    UI.showScreen('menu');
    console.log('[Main] 五子棋已就绪');
  }

  // ==================== 防后台断线 ====================

  async function requestWakeLock() {
    if (!wakeLockSupported || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[Main] Wake Lock 已激活');
      wakeLock.addEventListener('release', () => {
        console.log('[Main] Wake Lock 已释放');
        wakeLock = null;
      });
    } catch (e) {
      // 用户拒绝或系统不支持，静默忽略
      console.log('[Main] Wake Lock 请求失败:', e.message);
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try { await wakeLock.release(); } catch (e) { /* ignore */ }
      wakeLock = null;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      // 切换到后台时提示
      if (currentMode === MODE.ONLINE && !gameOver) {
        UI.showToast('⚠️ 已切到后台，请尽快返回以免断线', 4000);
      }
      // 释放唤醒锁（让系统正常休眠）
      releaseWakeLock();
    } else {
      // 回到前台时重新获取唤醒锁
      if (currentMode === MODE.ONLINE && !gameOver) {
        requestWakeLock();
        // 检查连接是否还在
        if (!P2P.getStatus().isConnected) {
          UI.showToast('连接已断开，请重新开始', 4000);
          gameOver = true;
          stopTimer();
        }
      }
    }
  }

  function bindButtons() {
    UI.getElement('btn-local').addEventListener('click', () => startGame(MODE.LOCAL));
    UI.getElement('btn-ai-easy').addEventListener('click', () => startGame(MODE.AI_EASY));
    UI.getElement('btn-ai-medium').addEventListener('click', () => startGame(MODE.AI_MEDIUM));
    UI.getElement('btn-online').addEventListener('click', showOnlineScreen);
    UI.getElement('btn-back').addEventListener('click', confirmBack);
    UI.getElement('btn-undo').addEventListener('click', handleUndo);
    UI.getElement('btn-restart').addEventListener('click', handleRestart);
    UI.getElement('btn-online-back').addEventListener('click', () => { P2P.disconnect(); UI.showScreen('menu'); });
    UI.getElement('btn-create-room').addEventListener('click', handleCreateRoom);
    UI.getElement('btn-join-room').addEventListener('click', handleJoinRoom);
    UI.getElement('btn-copy-room').addEventListener('click', handleCopyRoom);
    UI.getElement('btn-paste-room').addEventListener('click', handlePasteRoom);
  }

  // ==================== 计时器 ====================

  function startTimer(player) {
    stopTimer();
    timerPlayer = player;
    timerDeadline = Date.now() + MOVE_TIME * 1000;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      const str = min + ':' + String(sec).padStart(2, '0');
      UI.updateTimerDisplay(player, str);
      UI.setTimerUrgent(player, remaining <= 20 && remaining > 0);

      if (remaining <= 0) {
        handleTimeout(player);
      }
    }, 200);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerPlayer = null;
    // 清除紧急状态
    UI.setTimerUrgent(Board.BLACK, false);
    UI.setTimerUrgent(Board.WHITE, false);
  }

  function updateTimerDisplay() {
    if (!timerPlayer) return;
    const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    UI.updateTimerDisplay(timerPlayer, min + ':' + String(sec).padStart(2, '0'));
  }

  function handleTimeout(player) {
    stopTimer();
    gameOver = true;
    const winner = player === Board.BLACK ? Board.WHITE : Board.BLACK;
    UI.setHint('⏰ ' + (player === Board.BLACK ? '黑方' : '白方') + '超时！');
    setTimeout(() => {
      UI.showWin(winner, currentMode === MODE.ONLINE);
      if (winner) {
        const last = Board.getState().history;
        if (last.length > 0) {
          const final = last[last.length - 1];
          UI.setWinLine(final.x, final.y, winner);
        }
      }
    }, 400);
  }

  // ==================== 游戏流程 ====================

  function startGame(mode) {
    currentMode = mode;
    gameOver = false;
    aiThinking = false;
    pendingRequest = null;
    Board.reset();
    UI.clearHighlight();
    UI.clearWinLine();
    UI.hideWin();
    UI.hideRequest();
    UI.setHint('');
    UI.showScreen('game');
    UI.resizeCanvas();

    // 联机模式下回合取决于我方颜色（黑先白后）
    if (currentMode === MODE.ONLINE) {
      isMyTurn = (onlinePlayerColor === Board.BLACK);
    } else {
      isMyTurn = true;
    }
    updatePlayerCards();
    UI.setMoveCount(1);

    // 人机模式不计时，其余模式黑方启动计时
    if (currentMode !== MODE.AI_EASY && currentMode !== MODE.AI_MEDIUM) {
      startTimer(Board.BLACK);
    }

    // 联机模式申请唤醒锁（防止后台断线）
    if (currentMode === MODE.ONLINE) {
      requestWakeLock();
    }
  }

  /** 更新双方玩家卡片 */
  function updatePlayerCards() {
    const bName = getPlayerName(Board.BLACK);
    const wName = getPlayerName(Board.WHITE);
    const activePlayer = gameOver ? null : Board.getCurrentPlayer();
    UI.setPlayerCards(bName, formatTime(MOVE_TIME), wName, formatTime(MOVE_TIME), activePlayer);

    // 更新悔棋按钮状态（无可悔时禁用）
    const historyLen = Board.getState().history.length;
    const canUndo = !gameOver && !aiThinking && historyLen > 0;
    if (currentMode === MODE.ONLINE) {
      // 联机模式：只有自己回合且有待悔的棋时才能申请
      UI.getElement('btn-undo').disabled = !(canUndo && isMyTurn);
    } else if (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM) {
      // AI 模式：需要至少 2 手历史
      UI.getElement('btn-undo').disabled = !(canUndo && historyLen >= 2);
    } else {
      UI.getElement('btn-undo').disabled = !canUndo;
    }
  }

  function getPlayerName(player) {
    if (currentMode === MODE.LOCAL) {
      return player === Board.BLACK ? '玩家 1' : '玩家 2';
    }
    if (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM) {
      return player === Board.BLACK ? '你' : 'AI';
    }
    if (currentMode === MODE.ONLINE) {
      if (player === onlinePlayerColor) return '你';
      return '对手';
    }
    return player === Board.BLACK ? '黑方' : '白方';
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // ==================== 落子处理 ====================

  function handlePlayerMove(x, y) {
    if (gameOver || aiThinking) return;
    if (currentMode === MODE.ONLINE && !isMyTurn) {
      UI.showToast('等待对手落子…');
      return;
    }
    if (!tryPlaceStone(x, y)) return;
    if (currentMode === MODE.ONLINE) P2P.sendMove(x, y);
  }

  function tryPlaceStone(x, y) {
    if (!Board.placeStone(x, y)) return false;

    UI.setHighlight(x, y);
    UI.setMoveCount(Board.getState().history.length);

    // 检查胜负
    const winner = Board.checkWin(x, y);
    if (winner) {
      gameOver = true;
      stopTimer();
      updatePlayerCards();
      UI.setWinLine(x, y, winner);
      setTimeout(() => UI.showWin(winner, currentMode === MODE.ONLINE), 1500);
      return true;
    }

    if (Board.isDraw()) {
      gameOver = true;
      stopTimer();
      updatePlayerCards();
      setTimeout(() => UI.showWin(null, false), 1500);
      return true;
    }

    // 切换玩家
    Board.switchPlayer();
    updatePlayerCards();

    // 重启对方计时器（人机模式不计时，跳过）
    const isAI = (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM);
    if (!gameOver && !isAI) startTimer(Board.getCurrentPlayer());

    // AI 模式
    if (!gameOver && isAI) {
      aiThinking = true;
      const difficulty = currentMode === MODE.AI_EASY ? 'normal' : 'hard';
      const diffLabel = currentMode === MODE.AI_EASY ? '简单' : '中等';
      UI.setHint('AI 思考中（' + diffLabel + '）…');
      // 模拟人类思考：随机 0.8~3 秒
      const thinkTime = 800 + Math.random() * 2200;
      setTimeout(() => {
        const move = AI.getMove(Board, difficulty);
        if (move) {
          Board.placeStone(move.x, move.y);
          UI.setHighlight(move.x, move.y);
          UI.setMoveCount(Board.getState().history.length);

          const aiWinner = Board.checkWin(move.x, move.y);
          if (aiWinner) {
            gameOver = true;
            stopTimer();
            updatePlayerCards();
            UI.setWinLine(move.x, move.y, aiWinner);
            setTimeout(() => UI.showWin(aiWinner, false), 1500);
          } else if (Board.isDraw()) {
            gameOver = true;
            stopTimer();
            updatePlayerCards();
            setTimeout(() => UI.showWin(null, false), 1500);
          } else {
            Board.switchPlayer();
            updatePlayerCards();
            // 人机模式不计时，无需重启
          }
        }
        UI.setHint('');
        aiThinking = false;
      }, thinkTime);
    }

    // 联机模式：切换回合
    if (currentMode === MODE.ONLINE && !gameOver) {
      isMyTurn = false;
    }

    return true;
  }

  // ==================== 悔棋 ====================

  function handleUndo() {
    if (gameOver || aiThinking) return;
    if (Board.getState().history.length === 0) {
      UI.showToast('没有可悔的棋');
      return;
    }

    if (currentMode === MODE.LOCAL) {
      doLocalUndo();
    } else if (currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM) {
      // AI 模式：撤回玩家+AI 各一手（使用 Board.undo()）
      doAiUndo();
    } else if (currentMode === MODE.ONLINE) {
      // 只有自己回合才能申请悔棋
      if (!isMyTurn) { UI.showToast('只有你的回合才能申请悔棋'); return; }
      if (pendingRequest) { UI.showToast('已有待处理请求'); return; }
      P2P.sendUndoRequest();
      pendingRequest = 'undo';
      UI.showToast('已发送悔棋申请，等待回复…', 5000);
    }
  }

  /** 本地模式悔棋：撤回一手 */
  function doLocalUndo() {
    stopTimer();
    Board.undoOne();
    UI.clearHighlight();
    UI.clearWinLine();
    UI.setMoveCount(Board.getState().history.length);
    updatePlayerCards();
    UI.setHint('已悔棋');
    setTimeout(() => UI.setHint(''), 2000);
    if (!gameOver) startTimer(Board.getCurrentPlayer());
  }

  /** AI 模式悔棋：撤回玩家+AI 各一手 */
  function doAiUndo() {
    stopTimer();
    Board.undo(); // 撤回两步（玩家+AI）
    UI.clearHighlight();
    UI.clearWinLine();
    UI.setMoveCount(Board.getState().history.length);
    updatePlayerCards();
    UI.setHint('已悔棋');
    setTimeout(() => UI.setHint(''), 2000);
    if (!gameOver) startTimer(Board.getCurrentPlayer());
  }

  /** 联机模式悔棋：撤回对手最后一步 + 自己上一步（共两步） */
  function doOnlineUndo() {
    stopTimer();
    Board.undo(); // 撤回双方各一手
    isMyTurn = true; // 悔棋后必然是申请方（当前回合方）的回合
    UI.clearHighlight();
    UI.clearWinLine();
    UI.setMoveCount(Board.getState().history.length);
    updatePlayerCards();
    UI.setHint('已悔棋');
    setTimeout(() => UI.setHint(''), 2000);
    if (!gameOver) startTimer(Board.getCurrentPlayer());
  }

  // ==================== 重新开始 ====================

  function handleRestart() {
    if (gameOver) {
      // 游戏已结束，直接重来
      if (currentMode === MODE.ONLINE) {
        P2P.sendRematchRequest();
        pendingRequest = 'rematch';
        UI.showToast('已发送重来申请，等待回复…', 5000);
      } else {
        startGame(currentMode);
      }
      return;
    }

    // 游戏中，确认重来
    if (currentMode === MODE.LOCAL || currentMode === MODE.AI_EASY || currentMode === MODE.AI_MEDIUM) {
      startGame(currentMode);
    } else if (currentMode === MODE.ONLINE) {
      if (pendingRequest) { UI.showToast('已有待处理请求'); return; }
      P2P.sendRematchRequest();
      pendingRequest = 'rematch';
      UI.showToast('已发送重来申请，等待回复…', 5000);
    }
  }

  function handlePlayAgain() {
    if (currentMode === MODE.ONLINE) {
      // 如果对手已经发来申请，直接同意（省去重复弹窗）
      if (pendingRequest === 'rematch_request_received') {
        acceptRequest();
        return;
      }
      // 如果自己已经发过申请，不重复发送
      if (pendingRequest === 'rematch') {
        UI.showToast('已发送重来申请，等待回复…');
        return;
      }
      P2P.sendRematchRequest();
      pendingRequest = 'rematch';
      UI.hideWin();
      UI.showToast('已发送重来申请，等待回复…', 5000);
    } else {
      startGame(currentMode);
    }
  }

  // ==================== 联机 ====================

  function showOnlineScreen() {
    UI.hideRoomInfo();
    UI.showScreen('online');
    UI.getElement('input-room-id').value = '';
    UI.getElement('join-error').classList.add('hidden');
    UI.getElement('btn-create-room').disabled = false;
    UI.getElement('btn-create-room').textContent = '创建房间';
    UI.getElement('btn-join-room').disabled = false;
    UI.getElement('btn-join-room').textContent = '加入';
    P2P.init({
      onConnected: onP2PConnected,
      onDisconnected: onP2PDisconnected,
      onMove: onP2PMove,
      onError: onP2PError,
    });
  }

  async function handleCreateRoom() {
    try {
      const btn = UI.getElement('btn-create-room');
      btn.disabled = true; btn.textContent = '创建中…';
      await P2P.createRoom();
      UI.showRoomInfo(P2P.getRoomId());
      btn.textContent = '房间已创建';
    } catch (err) {
      UI.showToast('创建房间失败，请重试');
      const btn = UI.getElement('btn-create-room');
      btn.disabled = false; btn.textContent = '创建房间';
    }
  }

  async function handleJoinRoom() {
    const roomId = UI.getInputRoomId();
    if (!roomId) { UI.showJoinError('请输入房间号'); return; }
    try {
      const btn = UI.getElement('btn-join-room');
      btn.disabled = true; btn.textContent = '连接中…';
      await P2P.joinRoom(roomId);
      btn.textContent = '已连接';
    } catch (err) {
      UI.showJoinError(err.message || '加入房间失败');
      const btn = UI.getElement('btn-join-room');
      btn.disabled = false; btn.textContent = '加入';
    }
  }

  function handleCopyRoom() {
    const roomId = P2P.getRoomId();
    if (roomId && navigator.clipboard) {
      navigator.clipboard.writeText(roomId).then(() => UI.showToast('房间号已复制！')).catch(() => UI.showToast('房间号：' + roomId));
    }
  }

  async function handlePasteRoom() {
    try {
      if (!navigator.clipboard) { UI.showToast('当前浏览器不支持剪贴板'); return; }
      const text = await navigator.clipboard.readText();
      if (text) { UI.getElement('input-room-id').value = text.trim(); UI.showToast('已粘贴！'); }
      else UI.showToast('剪贴板为空');
    } catch { UI.showToast('无法读取剪贴板，请手动长按粘贴'); }
  }

  function onP2PConnected() {
    const { isHost } = P2P.getStatus();
    onlinePlayerColor = isHost ? Board.BLACK : Board.WHITE;
    isMyTurn = (onlinePlayerColor === Board.BLACK);
    currentMode = MODE.ONLINE;
    gameOver = false;
    pendingRequest = null;
    Board.reset();
    UI.clearHighlight();
    UI.clearWinLine();
    UI.hideWin();
    UI.hideRequest();
    UI.setHint('');
    UI.showScreen('game');
    UI.resizeCanvas();
    updatePlayerCards();
    UI.setMoveCount(1);
    UI.showToast('连接成功！' + (isHost ? '你执黑先行' : '你执白，等待对手'));
    startTimer(Board.BLACK); // 黑方先

    // ★ 联机开始，申请唤醒锁防止后台断线
    requestWakeLock();
  }

  function onP2PDisconnected() {
    releaseWakeLock();
    if (currentMode === MODE.ONLINE && !gameOver) {
      UI.showToast('对手已断开连接', 3000);
      gameOver = true;
      stopTimer();
    }
  }

  function onP2PMove(type, arg) {
    if (type === 'restart') {
      // 旧的直接重启信号（废弃，现在用 rematch_request）
      return;
    }

    // 悔棋申请
    if (type === 'undo_request') {
      if (gameOver) { P2P.sendUndoResponse(false); return; }
      UI.showRequest('对手申请悔棋，是否同意？');
      pendingRequest = 'undo_request_received';
      return;
    }

    // 悔棋响应
    if (type === 'undo_response') {
      pendingRequest = null;
      if (arg) {
        doOnlineUndo();
        UI.showToast('对手同意了悔棋');
      } else {
        UI.showToast('对手拒绝了悔棋');
      }
      return;
    }

    // 重来申请
    if (type === 'rematch_request') {
      if (pendingRequest === 'rematch') {
        // ★ 双方同时申请重来 → 自动同意，避免弹两个窗
        P2P.sendRematchResponse(true);
        onlinePlayerColor = onlinePlayerColor === Board.BLACK ? Board.WHITE : Board.BLACK;
        UI.showToast('双方都想重来，游戏重新开始！');
        startGame(MODE.ONLINE);
        pendingRequest = null;
        return;
      }
      if (gameOver) {
        UI.showRequest('对手申请重新开始，是否同意？');
        pendingRequest = 'rematch_request_received';
      } else {
        // 新游戏已开始（我方先收到了对方的 rematch_response），补充回应
        P2P.sendRematchResponse(true);
      }
      return;
    }

    // 重来响应
    if (type === 'rematch_response') {
      if (arg && pendingRequest === 'rematch') {
        // 正常单向申请流程：对方同意
        onlinePlayerColor = onlinePlayerColor === Board.BLACK ? Board.WHITE : Board.BLACK;
        UI.showToast('对手同意了，游戏重新开始！');
        startGame(MODE.ONLINE);
      } else if (arg && pendingRequest === null) {
        // ★ 双方同时申请的交叉响应，已在上面的自动同意中处理，忽略
      } else if (!arg) {
        UI.showToast('对手拒绝了重来请求');
      }
      pendingRequest = null;
      return;
    }

    // 普通落子
    if (gameOver) return;
    if (!Board.placeStone(type, arg)) return;

    UI.setHighlight(type, arg);
    UI.setMoveCount(Board.getState().history.length);
    const winner = Board.checkWin(type, arg);

    if (winner) {
      gameOver = true;
      stopTimer();
      updatePlayerCards();
      UI.setWinLine(type, arg, winner);
      setTimeout(() => UI.showWin(winner, true), 1500);
      return;
    }
    if (Board.isDraw()) {
      gameOver = true;
      stopTimer();
      updatePlayerCards();
      setTimeout(() => UI.showWin(null, true), 1500);
      return;
    }

    Board.switchPlayer();
    isMyTurn = true;
    updatePlayerCards();
    startTimer(Board.getCurrentPlayer());
  }

  function onP2PError(msg) { UI.showToast(msg, 4000); }

  /** 同意请求 */
  function acceptRequest() {
    UI.hideRequest();
    if (pendingRequest === 'undo_request_received') {
      P2P.sendUndoResponse(true);
      doOnlineUndo();
      pendingRequest = null;
    } else if (pendingRequest === 'rematch_request_received') {
      P2P.sendRematchResponse(true);
      pendingRequest = null;
      // 每局交换先手权
      onlinePlayerColor = onlinePlayerColor === Board.BLACK ? Board.WHITE : Board.BLACK;
      startGame(MODE.ONLINE);
    }
  }

  /** 拒绝请求 */
  function rejectRequest() {
    UI.hideRequest();
    if (pendingRequest === 'undo_request_received') {
      P2P.sendUndoResponse(false);
    } else if (pendingRequest === 'rematch_request_received') {
      P2P.sendRematchResponse(false);
    }
    pendingRequest = null;
  }

  // ==================== 其他 ====================

  function confirmBack() {
    // 游戏中离开需确认
    if (!gameOver && Board.getState().history.length > 0) {
      if (!confirm('确定要退出当前对局吗？')) return;
    }
    stopTimer();
    releaseWakeLock();
    if (currentMode === MODE.ONLINE) P2P.disconnect();
    gameOver = false; aiThinking = false;
    Board.reset(); UI.clearHighlight(); UI.clearWinLine(); UI.hideWin(); UI.hideRequest();
    UI.showScreen('menu');
  }

  function goToMenu() {
    stopTimer();
    releaseWakeLock();
    if (currentMode === MODE.ONLINE) P2P.disconnect();
    gameOver = false; aiThinking = false;
    Board.reset(); UI.clearHighlight(); UI.clearWinLine(); UI.hideWin(); UI.hideRequest();
    UI.showScreen('menu');
  }

  function checkURLParams() {
    const room = new URLSearchParams(location.search).get('room');
    if (room) { UI.getElement('input-room-id').value = room; showOnlineScreen(); setTimeout(() => handleJoinRoom(), 500); }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Main.init());
