# 第三方组件：Mihomo

NekoNet 安装包内置了 [Mihomo](https://github.com/MetaCubeX/mihomo) 可执行文件，用于提供实时流量统计与代理内核能力。

- 版本：v1.19.33（windows/amd64，with_gvisor）
- 许可证：GNU General Public License v3.0，全文见同目录 `LICENSE`
- 源码地址：https://github.com/MetaCubeX/mihomo/tree/v1.19.33

本程序仅以独立子进程方式调用该内核，未修改其源码。若需替换内核，将同名可执行文件放入安装目录的
`resources/mihomo/` 即可。
