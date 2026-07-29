/**
 * UI 界面管理模块
 * 负责 Canvas 绘制、屏幕切换、玩家卡片、计时显示、弹窗
 */
const UI = (() => {
  let canvas, ctx, board;
  const screens = {
    menu: document.getElementById('menu-screen'),
    game: document.getElementById('game-screen'),
    online: document.getElementById('online-screen'),
  };
  const elements = {};

  // 绘制参数
  let cellSize = 0, padding = 20, boardPixelSize = 0;
  let lastHighlight = null;
  let winLine = null; // {x1,y1,x2,y2} 胜利连线坐标

  /** 初始化 */
  function init(boardModule) {
    board = boardModule;
    canvas = document.getElementById('board-canvas');
    ctx = canvas.getContext('2d');

    // 缓存 DOM 元素
    const ids = [
      'btn-local','btn-ai-easy','btn-ai-medium','btn-online',
      'btn-back','btn-undo','btn-restart','btn-online-back',
      'btn-create-room','btn-join-room','btn-copy-room','btn-paste-room',
      'btn-play-again','btn-to-menu','btn-request-accept','btn-request-reject',
      'black-name','black-timer','white-name','white-timer',
      'black-card','white-card','move-count',
      'room-id-display','room-info','qr-code','input-room-id',
      'join-error','win-modal','win-text','request-modal','request-text',
      'toast','game-hint',
    ];
    ids.forEach(id => { elements[id] = document.getElementById(id); });

    window.addEventListener('resize', () => {
      if (screens.game.classList.contains('active')) resizeCanvas();
    });

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });

    registerSW();
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /** 调整 Canvas 尺寸 */
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const maxSize = Math.min(wrapper.clientWidth - 16, window.innerHeight - 160, 450);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = maxSize * dpr;
    canvas.height = maxSize * dpr;
    canvas.style.width = maxSize + 'px';
    canvas.style.height = maxSize + 'px';
    boardPixelSize = maxSize;
    cellSize = (maxSize - padding * 2) / (board.SIZE - 1);
    draw();
  }

  /** 切换屏幕 */
  function showScreen(name) {
    Object.keys(screens).forEach(k => screens[k].classList.toggle('active', k === name));
  }

  /** 绘制棋盘（含胜利连线） */
  function draw() {
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const w = boardPixelSize, p = padding, s = cellSize, size = board.SIZE;

    // 棋盘背景 + 木纹
    ctx.fillStyle = '#d4a259';
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = 'rgba(139,105,20,0.05)';
    for (let i = 0; i < w; i += 4) ctx.fillRect(0, i, w, 2);

    // 网格线
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 1;
    for (let i = 0; i < size; i++) {
      const pos = p + i * s;
      ctx.beginPath(); ctx.moveTo(p, pos); ctx.lineTo(p + (size-1)*s, pos); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pos, p); ctx.lineTo(pos, p + (size-1)*s); ctx.stroke();
    }

    // 星位
    [[3,3],[7,3],[11,3],[3,7],[7,7],[11,7],[3,11],[7,11],[11,11]].forEach(([cx,cy]) => {
      ctx.fillStyle = '#8b6914';
      ctx.beginPath(); ctx.arc(p+cx*s, p+cy*s, 3, 0, Math.PI*2); ctx.fill();
    });

    // 棋子
    const grid = board.getState().grid;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (grid[y][x] !== board.EMPTY) drawStone(x, y, grid[y][x]);

    // 最后落子高亮
    if (lastHighlight) {
      const px = p + lastHighlight.x * s, py = p + lastHighlight.y * s;
      ctx.strokeStyle = '#e94560'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(px, py, s*0.48, 0, Math.PI*2); ctx.stroke();
    }

    // ★ 胜利连线
    if (winLine) {
      const { x1, y1, x2, y2 } = winLine;
      ctx.strokeStyle = '#e94560'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(233,68,96,0.8)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(p + x1 * s, p + y1 * s);
      ctx.lineTo(p + x2 * s, p + y2 * s);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawStone(x, y, player) {
    const px = padding + x * cellSize, py = padding + y * cellSize, r = cellSize * 0.44;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    if (player === board.BLACK) {
      const g = ctx.createRadialGradient(px-r*0.3, py-r*0.3, r*0.1, px, py, r);
      g.addColorStop(0,'#555'); g.addColorStop(1,'#111');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(px-r*0.3, py-r*0.3, r*0.1, px, py, r);
      g.addColorStop(0,'#fff'); g.addColorStop(1,'#bbb');
      ctx.fillStyle = g;
    }
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  /** Canvas 点击处理 */
  function handleCanvasClick(e) { const p = getGridPos(e); if (p) handleMove(p.x, p.y); }
  function handleCanvasTouch(e) { e.preventDefault(); const p = getGridPos(e.touches[0]); if (p) handleMove(p.x, p.y); }

  function getGridPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = boardPixelSize / rect.width, scaleY = boardPixelSize / rect.height;
    const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
    const col = Math.round((mx - padding) / cellSize), row = Math.round((my - padding) / cellSize);
    if (col < 0 || col >= board.SIZE || row < 0 || row >= board.SIZE) return null;
    const px = padding + col * cellSize, py = padding + row * cellSize;
    if (Math.hypot(mx - px, my - py) > cellSize * 0.45) return null;
    return { x: col, y: row };
  }

  let onMoveCallback = null;
  function onMove(cb) { onMoveCallback = cb; }
  function handleMove(x, y) { if (onMoveCallback) onMoveCallback(x, y); }

  /** 棋子高亮与胜利连线 */
  function setHighlight(x, y) { lastHighlight = { x, y }; draw(); }
  function clearHighlight() { lastHighlight = null; draw(); }

  /** 设置并绘制胜利连线 */
  function setWinLine(x, y, player) {
    const grid = board.getState().grid;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx,dy] of dirs) {
      let minX = x, maxX = x, minY = y, maxY = y;
      for (let i = 1; i < 5; i++) {
        const nx = x + dx*i, ny = y + dy*i;
        if (board.get(nx, ny) === player) { minX = Math.min(minX,nx); maxX = Math.max(maxX,nx); minY = Math.min(minY,ny); maxY = Math.max(maxY,ny); }
        else break;
      }
      for (let i = 1; i < 5; i++) {
        const nx = x - dx*i, ny = y - dy*i;
        if (board.get(nx, ny) === player) { minX = Math.min(minX,nx); maxX = Math.max(maxX,nx); minY = Math.min(minY,ny); maxY = Math.max(maxY,ny); }
        else break;
      }
      if (maxX - minX >= 4 || maxY - minY >= 4 || (maxX-minX)+(maxY-minY) >= 4) {
        winLine = { x1: minX, y1: minY, x2: maxX, y2: maxY };
        draw();
        return;
      }
    }
  }
  function clearWinLine() { winLine = null; draw(); }

  /** 玩家卡片更新 */
  function setPlayerCards(bName, bTimer, wName, wTimer, activePlayer) {
    elements['black-name'].textContent = bName;
    elements['black-timer'].textContent = bTimer;
    elements['white-name'].textContent = wName;
    elements['white-timer'].textContent = wTimer;

    const bCard = elements['black-card'], wCard = elements['white-card'];
    bCard.classList.toggle('active', activePlayer === board.BLACK);
    wCard.classList.toggle('active', activePlayer === board.WHITE);
  }

  /** 计时器更新（仅更新时间数字） */
  function updateTimerDisplay(player, timeStr) {
    const el = player === board.BLACK ? elements['black-timer'] : elements['white-timer'];
    el.textContent = timeStr;
  }

  /** 计时器紧急状态 */
  function setTimerUrgent(player, urgent) {
    const el = player === board.BLACK ? elements['black-timer'] : elements['white-timer'];
    el.classList.toggle('urgent', urgent);
  }

  /** 手数显示 */
  function setMoveCount(n) { elements['move-count'].textContent = '第 ' + n + ' 手'; }

  /** 底部提示 */
  function setHint(text) { elements['game-hint'].textContent = text || ''; }

  /** 胜利弹窗 */
  function showWin(player, isOnline) {
    let text;
    if (player === board.BLACK) text = '⚫ 黑棋获胜！';
    else if (player === board.WHITE) text = '⚪ 白棋获胜！';
    else text = '🤝 平局！';
    elements['win-text'].textContent = text;
    elements['win-modal'].classList.remove('hidden');
    // 联机模式下胜利弹窗不需要"再来一局"按钮（需对手同意）
    const playAgainBtn = elements['btn-play-again'];
    if (isOnline) {
      playAgainBtn.textContent = '申请重来';
    } else {
      playAgainBtn.textContent = '再来一局';
    }
  }
  function hideWin() { elements['win-modal'].classList.add('hidden'); }

  /** 请求弹窗（联机悔棋/重来） */
  function showRequest(text) {
    elements['request-text'].textContent = text;
    elements['request-modal'].classList.remove('hidden');
  }
  function hideRequest() { elements['request-modal'].classList.add('hidden'); }

  /** Toast */
  function showToast(msg, dur = 2000) {
    const t = elements['toast']; t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), dur);
  }

  /** 房间信息 */
  function showRoomInfo(roomId) {
    elements['room-id-display'].textContent = roomId;
    elements['room-info'].classList.remove('hidden');
    const qr = elements['qr-code']; qr.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qr, { text: location.origin + location.pathname + '?room=' + roomId, width: 140, height: 140, colorDark: '#1a1a2e', colorLight: '#ffffff' });
    }
  }
  function hideRoomInfo() {
    elements['room-info'].classList.add('hidden');
    elements['qr-code'].innerHTML = '';
  }
  function showJoinError(msg) {
    const el = elements['join-error']; el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
  function getInputRoomId() { return elements['input-room-id'].value.trim(); }
  function getElement(id) { return elements[id]; }

  return {
    init, draw, showScreen, resizeCanvas,
    setHighlight, clearHighlight, setWinLine, clearWinLine,
    setPlayerCards, updateTimerDisplay, setTimerUrgent,
    setMoveCount, setHint,
    showWin, hideWin, showRequest, hideRequest,
    showToast, showRoomInfo, hideRoomInfo, showJoinError,
    getInputRoomId, getElement, onMove,
  };
})();
