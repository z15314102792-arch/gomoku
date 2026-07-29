/**
 * UI 界面管理模块
 * 负责 Canvas 绘制、屏幕切换、弹窗等
 */
const UI = (() => {
  // DOM 元素
  let canvas, ctx;
  let board; // Board 模块引用（由 main.js 设置）

  const screens = {
    menu: document.getElementById('menu-screen'),
    game: document.getElementById('game-screen'),
    online: document.getElementById('online-screen'),
  };

  const elements = {};

  // 绘制参数
  let cellSize = 0;
  let padding = 20;
  let boardPixelSize = 0;
  let lastHighlight = null; // {x, y} 最后落子高亮
  let hoverPos = null;      // 触摸悬停位置

  /** 初始化 UI，缓存 DOM 引用 */
  function init(boardModule) {
    board = boardModule;
    canvas = document.getElementById('board-canvas');
    ctx = canvas.getContext('2d');

    // 缓存常用 DOM 元素
    const ids = [
      'btn-local', 'btn-ai-easy', 'btn-ai-medium', 'btn-online',
      'btn-back', 'btn-restart', 'btn-online-back',
      'btn-create-room', 'btn-join-room', 'btn-copy-room',
      'btn-play-again', 'btn-to-menu',
      'current-player', 'status-text', 'room-id-display',
      'room-info', 'qr-code', 'input-room-id',
      'join-error', 'win-modal', 'win-text', 'toast',
    ];
    ids.forEach(id => {
      elements[id] = document.getElementById(id);
    });

    // 尺寸初始化推迟到游戏界面可见时（避免 display:none 时 clientWidth=0）
    window.addEventListener('resize', () => {
      // 只在游戏界面可见时重绘
      if (screens.game.classList.contains('active')) {
        resizeCanvas();
      }
    });

    // 触摸/鼠标事件
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });

    // 按钮事件由 main.js 绑定

    // 注册 Service Worker
    registerSW();
  }

  /** 注册 Service Worker */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.log('[SW] 注册失败（本地开发可忽略）:', err.message);
      });
    }
  }

  /** 调整 Canvas 尺寸 */
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const maxSize = Math.min(
      wrapper.clientWidth - 16,
      window.innerHeight - 120,
      450
    );

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
  function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === screenName);
    });
  }

  /** 绘制棋盘 */
  function draw() {
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const w = boardPixelSize;
    const p = padding;
    const s = cellSize;
    const size = board.SIZE;

    // 棋盘背景
    ctx.fillStyle = '#d4a259';
    ctx.fillRect(0, 0, w, w);

    // 木纹纹理
    ctx.fillStyle = 'rgba(139, 105, 20, 0.05)';
    for (let i = 0; i < w; i += 4) {
      ctx.fillRect(0, i, w, 2);
    }

    // 网格线
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 1;

    for (let i = 0; i < size; i++) {
      const pos = p + i * s;
      // 横线
      ctx.beginPath();
      ctx.moveTo(p, pos);
      ctx.lineTo(p + (size - 1) * s, pos);
      ctx.stroke();
      // 竖线
      ctx.beginPath();
      ctx.moveTo(pos, p);
      ctx.lineTo(pos, p + (size - 1) * s);
      ctx.stroke();
    }

    // 星位
    const starPoints = size === 15
      ? [[3, 3], [7, 3], [11, 3], [3, 7], [7, 7], [11, 7], [3, 11], [7, 11], [11, 11]]
      : [[Math.floor(size / 2), Math.floor(size / 2)]];

    ctx.fillStyle = '#8b6914';
    starPoints.forEach(([cx, cy]) => {
      const sx = p + cx * s;
      const sy = p + cy * s;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 棋子
    const grid = board.getState().grid;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x] !== board.EMPTY) {
          drawStone(x, y, grid[y][x], false);
        }
      }
    }

    // 最后落子高亮
    if (lastHighlight) {
      const px = p + lastHighlight.x * s;
      const py = p + lastHighlight.y * s;
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, s * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 悬停预览（仅在人机对战时对当前玩家显示）
    if (hoverPos && !lastHighlight) {
      // 不画悬停预览，保持干净
    }
  }

  /** 绘制棋子 */
  function drawStone(x, y, player, highlight) {
    const px = padding + x * cellSize;
    const py = padding + y * cellSize;
    const radius = cellSize * 0.44;

    ctx.save();

    // 阴影
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    if (player === board.BLACK) {
      const grad = ctx.createRadialGradient(px - radius * 0.3, py - radius * 0.3, radius * 0.1, px, py, radius);
      grad.addColorStop(0, '#555');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createRadialGradient(px - radius * 0.3, py - radius * 0.3, radius * 0.1, px, py, radius);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, '#bbb');
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Canvas 点击处理 */
  function handleCanvasClick(e) {
    const pos = getGridPos(e);
    if (pos) {
      handleMove(pos.x, pos.y);
    }
  }

  /** Canvas 触摸处理 */
  function handleCanvasTouch(e) {
    e.preventDefault();
    const pos = getGridPos(e.touches[0]);
    if (pos) {
      handleMove(pos.x, pos.y);
    }
  }

  /** 从鼠标/触摸事件获取棋盘坐标 */
  function getGridPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = boardPixelSize / rect.width;
    const scaleY = boardPixelSize / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const col = Math.round((mx - padding) / cellSize);
    const row = Math.round((my - padding) / cellSize);

    if (col < 0 || col >= board.SIZE || row < 0 || row >= board.SIZE) return null;

    // 检查是否离交叉点足够近
    const px = padding + col * cellSize;
    const py = padding + row * cellSize;
    const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);

    if (dist > cellSize * 0.45) return null;

    return { x: col, y: row };
  }

  // 落子回调（由 main.js 设置）
  let onMoveCallback = null;
  function onMove(callback) {
    onMoveCallback = callback;
  }

  function handleMove(x, y) {
    if (onMoveCallback) {
      onMoveCallback(x, y);
    }
  }

  /** 设置高亮位置并重绘 */
  function setHighlight(x, y) {
    lastHighlight = { x, y };
    draw();
  }

  /** 清除高亮 */
  function clearHighlight() {
    lastHighlight = null;
    draw();
  }

  /** 更新状态栏 */
  function updateStatus(player, text) {
    const indicator = elements['current-player'];
    const statusText = elements['status-text'];

    indicator.className = 'stone-indicator ' + (player === board.BLACK ? 'black' : 'white');
    statusText.textContent = text;
  }

  /** 显示胜利弹窗 */
  function showWin(player, isOnline) {
    let text;
    if (player === board.BLACK) {
      text = isOnline ? '⚫ 黑棋获胜！' : '⚫ 黑棋获胜！';
    } else if (player === board.WHITE) {
      text = isOnline ? '⚪ 白棋获胜！' : '⚪ 白棋获胜！';
    } else {
      text = '🤝 平局！';
    }

    elements['win-text'].textContent = text;
    elements['win-modal'].classList.remove('hidden');
  }

  /** 隐藏胜利弹窗 */
  function hideWin() {
    elements['win-modal'].classList.add('hidden');
  }

  /** 显示 Toast */
  function showToast(message, duration = 2000) {
    const toast = elements['toast'];
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  /** 显示/隐藏房间信息 */
  function showRoomInfo(roomId) {
    elements['room-id-display'].textContent = roomId;
    elements['room-info'].classList.remove('hidden');

    // 生成 QR 码
    const qrContainer = elements['qr-code'];
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      const url = location.origin + location.pathname + '?room=' + roomId;
      new QRCode(qrContainer, {
        text: url,
        width: 140,
        height: 140,
        colorDark: '#1a1a2e',
        colorLight: '#ffffff',
      });
    }
  }

  /** 隐藏房间信息 */
  function hideRoomInfo() {
    elements['room-info'].classList.add('hidden');
    const qrContainer = elements['qr-code'];
    qrContainer.innerHTML = '';
  }

  /** 显示加入错误 */
  function showJoinError(msg) {
    const el = elements['join-error'];
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  /** 获取输入的房间号 */
  function getInputRoomId() {
    return elements['input-room-id'].value.trim();
  }

  /** 获取 DOM 元素引用 */
  function getElement(id) {
    return elements[id];
  }

  return {
    init, draw, showScreen, setHighlight, clearHighlight,
    updateStatus, showWin, hideWin, showToast,
    showRoomInfo, hideRoomInfo, showJoinError,
    getInputRoomId, getElement,
    onMove,
    resizeCanvas,
  };
})();
