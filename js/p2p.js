/**
 * 联机对战模块
 * 基于 PeerJS WebRTC 实现 P2P 连接
 */
const P2P = (() => {
  let peer = null;
  let connection = null;
  let isHost = false;
  let isConnected = false;
  let roomId = null;

  // 回调
  let onConnected = null;
  let onDisconnected = null;
  let onMove = null;
  let onError = null;

  /** 初始化 */
  function init(callbacks) {
    onConnected = callbacks.onConnected || null;
    onDisconnected = callbacks.onDisconnected || null;
    onMove = callbacks.onMove || null;
    onError = callbacks.onError || null;
  }

  /** 创建房间 */
  function createRoom() {
    destroy();

    peer = new Peer({ debug: 0 });

    return new Promise((resolve, reject) => {
      peer.on('open', (id) => {
        roomId = id;
        isHost = true;
        console.log('[P2P] 房间已创建:', id);

        // ★ 立即返回房间号给界面（之前 resolve 放在 connection 回调里，
        //    导致没人加入就永远看不到房间号）
        resolve(id);

        // 等待对手连接（独立于房间号返回）
        peer.on('connection', (conn) => {
          if (connection) {
            conn.close();
            return;
          }
          setupConnection(conn);
        });
      });

      peer.on('error', (err) => {
        console.error('[P2P] 错误:', err);
        if (onError) onError('连接服务异常，请重试');
        reject(err);
      });
    });
  }

  /** 加入房间 */
  function joinRoom(remoteId) {
    destroy();

    peer = new Peer({ debug: 0 });

    return new Promise((resolve, reject) => {
      peer.on('open', () => {
        isHost = false;
        console.log('[P2P] 正在连接到:', remoteId);

        const conn = peer.connect(remoteId, { reliable: true });
        connection = conn;

        // 连接超时
        const timeout = setTimeout(() => {
          if (!isConnected) {
            reject(new Error('连接超时，请确认房间号正确'));
          }
        }, 15000);

        conn.on('open', () => {
          clearTimeout(timeout);
          isConnected = true;
          console.log('[P2P] 连接已建立');
          resolve(remoteId);
          if (onConnected) onConnected();
        });

        conn.on('data', handleData);
        conn.on('close', handleClose);
        conn.on('error', (err) => {
          console.error('[P2P] DataChannel 错误:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('[P2P] 错误:', err);
        if (onError) onError('无法连接到对方');
        reject(err);
      });
    });
  }

  /** 设置 DataChannel（房主侧，连接已建立） */
  function setupConnection(conn) {
    connection = conn;
    isConnected = true;
    console.log('[P2P] 连接已建立');

    conn.on('data', handleData);
    conn.on('close', handleClose);
    conn.on('error', (err) => {
      console.error('[P2P] DataChannel 错误:', err);
    });

    if (onConnected) onConnected();
  }

  function handleData(data) {
    console.log('[P2P] 收到数据:', data);
    if (data.type === 'move' && onMove) {
      onMove(data.x, data.y);
    } else if (data.type === 'restart' && onMove) {
      onMove('restart');
    } else if (data.type === 'undo_request' && onMove) {
      onMove('undo_request');
    } else if (data.type === 'undo_response' && onMove) {
      onMove('undo_response', data.accept);
    } else if (data.type === 'rematch_request' && onMove) {
      onMove('rematch_request');
    } else if (data.type === 'rematch_response' && onMove) {
      onMove('rematch_response', data.accept);
    }
  }

  function handleClose() {
    console.log('[P2P] 连接已关闭');
    isConnected = false;
    connection = null;
    if (onDisconnected) onDisconnected();
  }

  /** 发送落子坐标 */
  function sendMove(x, y) {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'move', x, y });
    return true;
  }

  /** 发送重新开始信号 */
  function sendRestart() {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'restart' });
    return true;
  }

  /** 发送悔棋申请 */
  function sendUndoRequest() {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'undo_request' });
    return true;
  }

  /** 发送悔棋响应 */
  function sendUndoResponse(accept) {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'undo_response', accept });
    return true;
  }

  /** 发送重来申请 */
  function sendRematchRequest() {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'rematch_request' });
    return true;
  }

  /** 发送重来响应 */
  function sendRematchResponse(accept) {
    if (!connection || !isConnected) return false;
    connection.send({ type: 'rematch_response', accept });
    return true;
  }

  /** 获取状态 */
  function getStatus() {
    return { isHost, isConnected, roomId };
  }

  /** 获取房间号 */
  function getRoomId() {
    return roomId;
  }

  /** 断开并清理 */
  function disconnect() {
    destroy();
  }

  function destroy() {
    if (connection) {
      connection.close();
      connection = null;
    }
    if (peer) {
      peer.destroy();
      peer = null;
    }
    isConnected = false;
    isHost = false;
    roomId = null;
  }

  return {
    init,
    createRoom,
    joinRoom,
    sendMove,
    sendRestart,
    sendUndoRequest,
    sendUndoResponse,
    sendRematchRequest,
    sendRematchResponse,
    getStatus,
    getRoomId,
    disconnect,
  };
})();
