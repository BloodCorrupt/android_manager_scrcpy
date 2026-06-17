/**
 * ADB 设备管理路由
 * 支持 USB（通过本地 adb server）和 TCP（直连）双模式
 */

import type {FastifyInstance, FastifyRequest} from "fastify";
import {AdbServerClient, Adb, AdbDaemonTransport, type AdbPacketData, type AdbPacketInit} from "@yume-chan/adb";
import {AdbServerNodeTcpConnector} from "@yume-chan/adb-server-node-tcp";
import type {AdbTransport} from "@yume-chan/adb";
import {WebSocket} from "ws";
import {type ReadableWritablePair, Consumable, ReadableStream, TextDecoderStream} from "@yume-chan/stream-extra";
import {AdbScrcpyClient} from "@yume-chan/adb-scrcpy";
import {DefaultServerPath} from "@yume-chan/scrcpy";
import {BIN, VERSION} from "@yume-chan/fetch-scrcpy-server";
import fs from "fs/promises";
import {config} from "../config.js";
import {AdbDaemonDirectSocketsDevice} from "@/server/transport/adb-daemon-direct-sockets";
import {AdbNodeJsCredentialStore} from "@/server/credential-store";
import {WS} from "@/server/transport/socket-websocket.ts";
import type {DeviceInfo, DeviceResponse, DeviceBasicInfo} from "@/types/device.types";
// @ts-ignore
import {PrismaClient} from "@prisma/client";

const credentialStore = new AdbNodeJsCredentialStore();
const prisma = new PrismaClient();

/**
 * 判断设备 serial 是否为 USB 设备（非 IP:port 格式）
 */
function isUsbSerial(serial: string): boolean {
    // USB 设备的 serial 通常是字母数字字符串（如 "R5CT32XXXXX"）
    // TCP 设备的 serial 是 IP:port 格式（如 "192.168.1.100:5555"）
    return !serial.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/);
}

export async function adbRoutes(fastify: FastifyInstance) {

    // 初始化 ADB 客户端（连接本地 adb server）
    const connector = new AdbServerNodeTcpConnector(config.adb);
    const adbClient = new AdbServerClient(connector);
    fastify.log.info('ADB client initialized');

    // 读取 scrcpy server
    const server = await fs.readFile(BIN);
    fastify.log.info({version: VERSION}, 'Scrcpy server loaded');

    // 模块内部状态
    const transportCache = new Map<string, AdbTransport>();
    const wsClients = new Set<WebSocket>();

    // 注册清理钩子（优雅关闭时执行）
    fastify.addHook('onClose', async () => {
        fastify.log.info('Cleaning up ADB resources...');

        // 关闭所有 WebSocket 连接
        for (const client of wsClients) {
            if (client.readyState === 1) { // OPEN
                client.close(1001, 'Server shutting down');
            }
        }
        fastify.log.info({count: wsClients.size}, 'WebSocket clients closed');

        // 关闭所有 Transport 连接
        for (const [serial, transport] of transportCache) {
            try {
                await transport.close();
                fastify.log.debug({serial}, 'Transport closed');
            } catch (error) {
                fastify.log.warn({serial, error}, 'Failed to close transport');
            }
        }
        fastify.log.info({count: transportCache.size}, 'Transport connections closed');
    });

    /**
     * 构建设备列表（合并 adb server 设备和注册设备）
     */
    async function buildDeviceList(): Promise<DeviceBasicInfo[]> {
        const devices = await adbClient.getDevices();

        // adb server 设备（USB 和 TCP 都会出现）
        const adbDevices = devices.map((device): DeviceBasicInfo => ({
            serial: device.serial,
            state: device.state,
            model: device.model || '',
            product: device.product || '',
            device: device.device || '',
            transportId: Number(device.transportId),
            connectionType: isUsbSerial(device.serial) ? "usb" : "tcp",
        }));

        // 注册设备（数据库中的设备）
        const registeredDevices = await prisma.device.findMany();
        const registeredDeviceInfos = registeredDevices
            .filter((device: any) => {
                // 排除已经在 adb server 列表中的设备
                return !adbDevices.some(d => d.serial === device.serial_no);
            })
            .map((device: any): DeviceBasicInfo => ({
                serial: device.serial_no,
                state: "device",
                model: device.market_name || '',
                product: device.serial_no || '',
                device: device.model || '',
                transportId: Number(-1),
                connectionType: "registered",
            }));

        return [...adbDevices, ...registeredDeviceInfos];
    }

    /**
     * 获取或创建设备 transport
     * USB 设备通过 adb server，TCP 设备通过直连
     */
    async function getOrCreateTransport(serial: string): Promise<AdbTransport | null> {
        // 从缓存获取
        if (transportCache.has(serial)) {
            return transportCache.get(serial)!;
        }

        // 尝试通过本地 adb server 连接（USB 设备和 adb connect 的设备）
        try {
            const devices = await adbClient.getDevices();
            const device = devices.find((d) => d.serial === serial);

            if (device) {
                fastify.log.info({serial, type: 'adb-server'}, 'Creating transport via adb server');
                const transport = await adbClient.createTransport({
                    serial: device.serial,
                    transportId: device.transportId
                });

                transportCache.set(serial, transport);
                fastify.log.info({serial}, 'Transport created via adb server (USB/TCP)');
                return transport;
            }
        } catch (error) {
            fastify.log.warn({serial, error}, 'Failed to create transport via adb server, trying direct TCP...');
        }

        // 尝试通过 TCP 直连（IP:port 格式）
        if (!isUsbSerial(serial)) {
            try {
                fastify.log.info({serial, type: 'tcp-direct'}, 'Creating transport via TCP direct connect');
                const ipi = serial.split(":");
                const device: AdbDaemonDirectSocketsDevice = new AdbDaemonDirectSocketsDevice({
                    host: ipi[0],
                    port: parseInt(ipi[1]),
                });

                const connection: ReadableWritablePair<AdbPacketData, Consumable<AdbPacketInit>> = await device.connect();
                const transport = await AdbDaemonTransport.authenticate({
                    serial: device.serial,
                    connection: connection,
                    credentialStore: credentialStore,
                    initialDelayedAckBytes: 1,
                    preserveConnection: true,
                    readTimeLimit: 5,
                });

                transportCache.set(serial, transport);
                fastify.log.info({serial}, 'Transport created via TCP direct connect');
                return transport;
            } catch (error) {
                fastify.log.error({serial, error}, 'Failed to create TCP direct transport');
            }
        }

        return null;
    }

    // 设备变化监听
    adbClient.trackDevices().then((observer) => {
        observer.onListChange(async (_devices) => {
            fastify.log.debug({count: _devices.length}, 'Device list changed');

            try {
                const allDeviceInfos = await buildDeviceList();
                for (const client of wsClients) {
                    if (client.readyState === 1) { // OPEN
                        client.send(JSON.stringify(allDeviceInfos));
                    }
                }
            } catch (error) {
                fastify.log.error(error, 'Failed to broadcast device list');
            }
        });
    }).catch((error) => {
        fastify.log.error(error, 'Failed to track devices');
    });

    // 获取设备列表（HTTP + WebSocket）
    fastify.route({
        method: 'GET',
        url: '/devices',
        handler: async (_req, reply) => {
            try {
                const allDeviceInfos = await buildDeviceList();
                reply.setCookie("session", _req.cookies.session || config.auth.sessionToken, {
                    path: "/",
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: "lax"
                }).send(allDeviceInfos);
            } catch (err) {
                reply.log.error(err, "Failed to get devices");
                reply.code(500).send({error: "Failed to get devices"});
            }
        },
        wsHandler: async (socket) => {
            wsClients.add(socket);

            socket.on("close", () => {
                wsClients.delete(socket);
            });

            try {
                const allDeviceInfos = await buildDeviceList();
                socket.send(JSON.stringify(allDeviceInfos));
            } catch (err) {
                fastify.log.error(err, 'Failed to send initial device list to WebSocket');
                socket.close();
            }
        }
    });

    // 获取单个设备信息（HTTP + WebSocket）
    fastify.route({
        method: 'GET',
        url: '/device/:serial',
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    serial: {type: 'string'},
                    service: {type: 'string'}
                }
            }
        },
        handler: async (req: FastifyRequest<{ Params: { serial: string }, Querystring: { service: string } }>, reply) => {
            const {serial} = req.params;

            try {
                const transport = await getOrCreateTransport(serial);

                if (!transport) {
                    return reply.status(404).send({message: "Device not found or connection failed"});
                }

                const deviceInfo = await parseDeviceInfo(new Adb(transport), fastify);

                // 保存或更新设备信息到数据库
                try {
                    await prisma.device.upsert({
                        where: {
                            serial_no: serial
                        },
                        update: {
                            android_id: deviceInfo.android_id,
                            boot_id: deviceInfo.boot_id,
                            ble_mac: deviceInfo.ble_mac,
                            model: deviceInfo.model,
                            market_name: deviceInfo.market_name,
                            version: deviceInfo.android_version,
                            kernel_ver: deviceInfo.kernel_version,
                            adb_enabled: deviceInfo.adb_enabled ? '1' : '0',
                            adb_port: deviceInfo.adb_port.toString(),
                            adb_status: deviceInfo.adb_status,
                            adb_pid: deviceInfo.adb_pid.toString(),
                            iface: deviceInfo.network_interface,
                            src_ip: deviceInfo.network_src_ip,
                            iface_ip: deviceInfo.network_ip,
                        },
                        create: {
                            serial_no: serial,
                            android_id: deviceInfo.android_id,
                            boot_id: deviceInfo.boot_id,
                            ble_mac: deviceInfo.ble_mac,
                            model: deviceInfo.model,
                            market_name: deviceInfo.market_name,
                            version: deviceInfo.android_version,
                            kernel_ver: deviceInfo.kernel_version,
                            adb_enabled: deviceInfo.adb_enabled ? '1' : '0',
                            adb_port: deviceInfo.adb_port.toString(),
                            adb_status: deviceInfo.adb_status,
                            adb_pid: deviceInfo.adb_pid.toString(),
                            iface: deviceInfo.network_interface,
                            src_ip: deviceInfo.network_src_ip,
                            iface_ip: deviceInfo.network_ip,
                        }
                    });
                    req.log.info({serial: deviceInfo.serial_no || serial}, 'Device info saved to database');
                } catch (dbError) {
                    req.log.error(dbError, 'Failed to save device info to database');
                    // 不影响主流程，继续返回响应
                }

                // 返回符合 DeviceResponse 接口的数据
                const response: DeviceResponse = {
                    serial: serial,
                    state: "device",
                    model: transport.banner.model || '',
                    product: transport.banner.product || transport.banner.model || '',
                    device: transport.banner.device || '',
                    maxPayloadSize: transport.maxPayloadSize,
                    features: transport.banner.features,
                    info: deviceInfo,
                    connectionType: isUsbSerial(serial) ? "usb" : "tcp",
                };

                return response;
            } catch (error) {
                transportCache.delete(serial)
                req.log.error(error, "Failed to get device info");
                return reply.code(500).send({error: "Failed to get device info"});
            }
        },
        wsHandler: async (client, req: FastifyRequest<{
            Params: { serial: string },
            Querystring: { service: string }
        }>) => {
            const {serial} = req.params;
            const {service} = req.query;

            req.log.info({serial, service}, "WebSocket connection");

            if (!serial) {
                client.close(4000, "Serial number required");
                return;
            }
            const transport = transportCache.get(serial);
            if (!transport) {
                client.close(4004, "Transport not found");
                return;
            }

            try {

                // 推送 scrcpy server（如果需要）
                if (service.includes("com.genymobile.scrcpy.Server")) {
                    req.log.info("Pushing scrcpy server");
                    const adb = new Adb(transport);
                    await AdbScrcpyClient.pushServer(
                        adb,
                        new ReadableStream({
                            start(controller) {
                                controller.enqueue(new Uint8Array(server));
                                controller.close();
                            },
                        }),
                        DefaultServerPath
                    );
                }

                try {
                    const socket = await transport.connect(service);
                    await WS.build(socket, client, req)
                } catch (err) {
                    req.log.error(err, "ADB socket open failed")
                    client.close();
                    return;
                }
            } catch (error) {
                transportCache.delete(serial)
                req.log.error(error, "WebSocket connection failed");
                client.close(4500, "Connection failed");
            }
        }
    });

    // 强制重连设备
    fastify.route({
        method: 'POST',
        url: '/device/:serial/reconnect',
        schema: {
            params: {
                type: 'object',
                properties: {
                    serial: {type: 'string'}
                }
            }
        },
        handler: async (req: FastifyRequest<{ Params: { serial: string } }>, reply) => {
            const {serial} = req.params;
            try {
                const transport = transportCache.get(serial);
                if (transport) {
                    req.log.info({serial}, 'Forcefully closing cached transport for reconnect');
                    try {
                        await transport.close();
                    } catch (e) {
                        req.log.warn({serial, error: e}, 'Error closing transport during reconnect');
                    }
                    transportCache.delete(serial);
                }
                
                // 如果是 TCP 设备，可以尝试断开其直连，但由于 transport 已经关闭，下一次获取将建立新连接
                // 返回成功即可
                return { success: true, message: 'Transport cleared and connection reset' };
            } catch (error) {
                req.log.error(error, "Failed to reconnect device");
                return reply.code(500).send({error: "Failed to reconnect device"});
            }
        }
    });
}

async function parseDeviceInfo(adb: Adb, fastify: FastifyInstance): Promise<DeviceInfo> {
    // 执行多个 shell 命令获取设备信息
    const commands = {
        serial_no: 'getprop ro.serialno',
        android_id: 'settings get secure android_id',
        ble_mac: 'settings get secure bluetooth_address',
        boot_id: 'cat /proc/sys/kernel/random/boot_id',
        model: 'getprop ro.product.model',
        market_name: 'getprop ro.product.vendor.marketname',
        manufacturer: 'getprop ro.product.manufacturer',
        brand: 'getprop ro.product.brand',
        product: 'getprop ro.product.product',
        device: 'getprop ro.product.device',
        version: 'getprop ro.build.version.release',
        sdk_version: 'getprop ro.build.version.sdk',
        security_patch: 'getprop ro.build.version.security_patch',
        kernel_ver: 'uname -r',
        adb_enabled: 'settings get global adb_enabled',
        adb_port: 'getprop service.adb.tcp.port',
        adb_status: 'getprop init.svc.adbd',
        adb_pid: 'pidof adbd',
        iface: "ip route get 1 | grep -oE 'dev [^ ]+' | awk '{print $2}'",
        src_ip: "ip route get 1 | grep -oE 'src [^ ]+' | awk '{print $2}'",
        // 获取主网络接口的 IP（去除网络前缀）
        iface_ip: "iface=$(ip route get 1 | grep -oE 'dev [^ ]+' | awk '{print $2}') && ip -f inet addr show \"$iface\" | awk '/inet / {print $2}' | cut -d/ -f1",
        // CPU 信息
        cpu_info: "cat /proc/cpuinfo | grep 'Hardware' | head -1 | cut -d: -f2",
        cpu_cores: "cat /proc/cpuinfo | grep processor | wc -l",
        // 内存信息
        mem_total: "cat /proc/meminfo | grep MemTotal | awk '{print $2}'",
        mem_available: "cat /proc/meminfo | grep MemAvailable | awk '{print $2}'",
        // 存储信息
        storage_info: "df -h /data | tail -1 | awk '{print $2,$3,$4,$5}'",
        // 电池信息
        battery_level: "dumpsys battery | grep level | awk '{print $2}'",
        battery_status: "dumpsys battery | grep status | awk '{print $2}'",
        battery_temp: "dumpsys battery | grep temperature | awk '{print $2}'",
        // 屏幕信息
        // screen_size: "wm size | grep Physical | awk '{print $3}'",
        screen_size: "wm size | awk '{print $3}'",
        screen_density: "wm density | grep Physical | awk '{print $3}'",
        screen_orientation: "dumpsys display | grep mCurrentOrientation | awk -F= '{print $2}'",
    };

    const info: Record<string, string> = {};

    // 并发执行所有命令以提高性能
    const results = await Promise.allSettled(
        Object.entries(commands).map(async ([key, cmd]) => {
            try {
                const process = await adb.subprocess.shellProtocol!.spawn(cmd);
                let output = '';
                for await (const chunk of process.stdout.pipeThrough(new TextDecoderStream())) {
                    output += chunk;
                }
                return {key, value: output.trim()};
            } catch (error) {
                fastify.log.warn({key, cmd, error}, 'Failed to execute command');
                return {key, value: ''};
            }
        })
    );

    // 收集结果
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const {key, value} = result.value;
            info[key] = value;
        }
    }

    // 解析并格式化某些字段（扁平结构）
    const deviceInfo: DeviceInfo = {
        // 基本信息
        serial: adb.serial,
        serial_no: info.serial_no,
        android_id: info.android_id,
        boot_id: info.boot_id,
        ble_mac: info.ble_mac,

        // 设备型号
        model: info.model,
        market_name: info.market_name,
        manufacturer: info.manufacturer,
        brand: info.brand,
        device: info.device,

        // 系统版本
        android_version: info.version,
        sdk_version: parseInt(info.sdk_version) || 0,
        security_patch: info.security_patch,
        kernel_version: info.kernel_ver,

        // ADB 信息
        adb_enabled: info.adb_enabled === '1',
        adb_port: parseInt(info.adb_port) || -1,
        adb_status: info.adb_status,
        adb_pid: parseInt(info.adb_pid) || 0,

        // 网络信息
        network_interface: info.iface,          // 主网络接口名称，如: wlan0
        network_ip: info.iface_ip,              // 主网络接口 IP，如: 192.168.23.184
        network_src_ip: info.src_ip,            // 源 IP

        // 硬件信息
        cpu: info.cpu_info?.trim() || '',
        cpu_cores: parseInt(info.cpu_cores) || 0,
        mem_total_kb: parseInt(info.mem_total) || 0,
        mem_available_kb: parseInt(info.mem_available) || 0,
        storage: info.storage_info,

        // 电池信息
        battery_level: parseInt(info.battery_level) || 0,
        battery_status: parseInt(info.battery_status) || 0,
        battery_temperature: parseInt(info.battery_temp) || 0,

        // 屏幕信息
        screen_width: parseInt(info.screen_size.split("x")[0]) || 0,
        screen_height: parseInt(info.screen_size.split("x")[1]) || 0,
        screen_density: parseInt(info.screen_density) || 0,
        screen_orientation: parseInt(info.screen_orientation.trim()) || 0,
    };

    return deviceInfo;
}