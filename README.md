# 五子棋

移动端优先的 PWA 五子棋应用，基于原生 JavaScript + Canvas。

## 功能
- 15×15 棋盘，黑先白后，五子连线获胜。
- 本地双人、人机 AI、WebRTC 远程联机。
- 悔棋、重开、计时、胜利提示和 PWA 离线缓存。

## 入口
- 主页面：`index.html`
- 详细功能：见 [游戏介绍.md](游戏介绍.md)
- [GitHub Pages 演示地址（旧目录记录，待现场核验）](https://z15314102792-arch.github.io/gomoku/)

## 本地运行
建议使用静态文件服务器，而不是直接以 `file://` 打开，以确保 Service Worker 和 PWA 功能正常。例如在项目目录运行：

```bash
python -m http.server 8080
```

然后打开 `http://localhost:8080/`。
