# NekoNet · 家庭网络透视

一个跑在 Windows 桌面上的家庭网络面板：扫描局域网里连了什么设备、每个网口和 Wi-Fi 跑了多少流量、光猫是什么品牌、本机有没有 IPv6。全部数据只存在你自己的电脑上，不上传任何服务器。

## 能做什么

- **设备发现**：ARP 邻居表、mDNS、SSDP/UPnP、NetBIOS 名称、常见端口指纹五路一起探测，用 MAC 前缀（OUI）库补厂商，自动归类为电脑 / 手机 / 电视盒子 / 摄像头 / 路由器 / IoT 等类型。
- **光猫直读流量**：登录光猫管理页读取网口与 SSID 的累计字节数，按 30 秒差分算出实时速率，绘制 30 分钟 / 1 小时 / 24 小时的全屋速率曲线。**这条路径不需要开启系统代理，也不经过任何代理节点。**
- **内置 mihomo 内核**：需要按应用、按域名看明细时再开启。代理端口默认只监听 `127.0.0.1`，`allow-lan: false`，不会在局域网里暴露 7890。
- **光猫品牌与运营商识别**：按登录页特征识别中兴 / 华为 / 烽火 / 诺基亚 / TP-Link / 小米 / H3C / 华硕 / D-Link；运营商显示为中文（中国移动、中国电信、中国联通、中国广电）。
- **IPv6**：显示本机全局 IPv6 地址、地址列表与 IPv6 默认网关。
- **其他**：首次启动配置向导、网口与 SSID 重命名、新设备系统通知、深浅色主题、一键导出 JSON。

## 界面

| 页面 | 内容 |
| --- | --- |
| 总览 | 本机网卡、网关、公网 IP 与运营商、IPv6、设备雷达、实时速率、最近上下线记录 |
| 设备 | 全部设备列表与筛选，点开抽屉看识别依据、端口、厂商、接入位置 |
| 流量 | 光猫网口 / Wi-Fi 累计与实时速率、全屋速率曲线、内核明细 |
| 设置 | 扫描间隔与发现手段、光猫凭据、内核开关、命名、数据导出 |

## 技术栈

Electron 45 + electron-vite 6 + React 19 + TypeScript（strict）+ Tailwind CSS 3 + zustand，主进程用 Node 调用 Windows 原生命令（`Get-NetIPAddress`、`Get-NetIPConfiguration`、`Get-NetNeighbor`、`Get-NetRoute`）拿网卡、邻居表与默认路由，端口指纹用 TCP 连接探测，另有 mDNS/SSDP 监听。内置流量内核为 mihomo v1.19.33。

## 环境要求

- Windows 10 / 11 x64
- Node.js 20+（开发时使用 v24.18.0 验证）

## 开发

```bash
npm install
npm run dev        # 启动开发实例
npm run typecheck  # 类型检查（node + web 两套 tsconfig）
npm run build      # 产出 out/
```

## 打包 Windows 安装包

内置内核的二进制没有入库（61MB），打包前先自己放好：

1. 从 mihomo 发布页下载 Windows x64 版本，例如 `mihomo-windows-x64-compatible.zip`
2. 解压得到 `mihomo.exe`，重命名后放到 `resources/mihomo/mihomo.exe`（同目录的 `LICENSE`、`NOTICE.md` 已在仓库里）

```bash
npm run pack
```

产物默认在 `dist/NekoNet Setup 0.1.0.exe`。若目标目录被占用（例如项目放在 OneDrive 里，`dist/win-unpacked` 会被同步进程锁住），换个输出目录即可：

```bash
npx electron-builder --win --x64 --config.directories.output=C:/path/to/temp
```

安装包为 NSIS、非一键安装、仅为当前用户安装，不需要管理员权限。未做代码签名，首次运行 Windows 可能弹 SmartScreen 提示。

## 目录结构

```
src/
  main/           # 主进程
    scanner/      # 网卡与设备发现、光猫读取与品牌识别、速率历史
    gateway/      # mihomo 内核与 Clash 控制器
    state.ts      # 全局状态、扫描调度、设置生效
    store.ts      # 本机 JSON 持久化
  preload/        # contextBridge 暴露的窗口 API
  renderer/       # React 界面（pages / components / store / lib）
  shared/         # 主进程与界面共用的类型与中文标签表
resources/mihomo/ # 内置内核（二进制不入库）
build/            # 图标
```

## 数据与隐私

- 全部状态存在 `%APPDATA%\nekonet\nekonet-data.json`，内核配置在 `%APPDATA%\nekonet\core\config.yaml`。
- **光猫登录密码以明文保存在上面这个本机文件里**，仓库与安装包都不含任何真实凭据（源码默认值为空）。换电脑安装需要重新填写。
- 公网 IP 与运营商查询只发送请求本身，不附带设备信息；除本机命令和局域网探测外没有第三方上报。
- 内核只在 `127.0.0.1` 监听，向局域网开放代理需要你自己改配置。

## 已知限制

- **光猫流量读取目前只适配中兴 H3-2s（移动定制固件）**。其他品牌能被识别出来，但不会尝试登录——各家固件的登录加密与接口都不同，乱试会触发光猫的失败锁定。遇到不支持的光猫，流量页会给出提示和「打开光猫后台」入口，设备扫描、IPv6、内核明细照常可用。
- 光猫只提供网口与 SSID 的累计计数，没有按设备、按域名的细分；开机以来总量在光猫重启后归零。
- 扫描默认覆盖本机网卡所在的 `/24`。如果光猫下面还挂了一级路由器（双 NAT，例如内网 `192.168.10.1`），那一侧的设备不会被扫到，需要把扫描网段手动指过去。
- 速率曲线依赖持续采样，退出应用期间不会有数据点。

## 版本

当前 `v0.1.0`，安装包在 [Releases](https://github.com/kaynai1/nekonet/releases/tag/v0.1.0) 页面作为附件提供（141MB，超过 GitHub 代码区 100MB 单文件限制，所以不在源码列表里）。

## 许可

MIT（见 `package.json`）。内置 mihomo 内核遵循其自身的 GPL-3.0 许可，相关声明在 `resources/mihomo/LICENSE` 与 `NOTICE.md`。
