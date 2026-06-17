/**
 * 设备管理相关路由
 */

import type {FastifyInstance, FastifyRequest} from "fastify";
import type {PrismaClient} from "@prisma/client";
import type {DeviceRegisterData} from "@/types/device.types.ts";
import {config} from "../config.js";
import os from "os";
import {Socket} from "net";

export async function deviceRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
    
    // 设备注册接口
    fastify.post("/register", {
        schema: {
            description: "注册或更新设备信息",
            tags: ["device"],
            body: {
                type: "object",
                required: ["serial_no"],
                properties: {
                    serial_no: {type: "string", description: "设备序列号"},
                    android_id: {type: "string", description: "Android ID"},
                    boot_id: {type: "string", description: "启动ID"},
                    ble_mac: {type: "string", description: "蓝牙MAC地址"},
                    model: {type: "string", description: "设备型号"},
                    market_name: {type: "string", description: "设备市场名称"},
                    version: {type: "string", description: "Android系统版本"},
                    kernel_ver: {type: "string", description: "内核版本"},
                    adb_enabled: {type: "string", description: "ADB是否启用"},
                    adb_port: {type: "string", description: "ADB端口号"},
                    adb_status: {type: "string", description: "ADB守护进程状态"},
                    adb_pid: {type: "string", description: "ADB守护进程PID"},
                    iface: {type: "string", description: "网络接口名称"},
                    src_ip: {type: "string", description: "源IP地址"},
                    iface_ip: {type: "string", description: "网络接口IP地址"}
                }
            }
        }
    }, async (request: FastifyRequest<{Body: DeviceRegisterData}>, reply) => {
        try {
            const {serial_no, ...devicePayload} = request.body;

            const device = await prisma.device.upsert({
                where: {serial_no},
                update: devicePayload,
                create: {serial_no, ...devicePayload}
            });

            request.log.info({deviceId: device.id, serial: device.serial_no}, "Device registered");

            return {
                success: true,
                message: "Device registered successfully",
                data: device.id
            };
        } catch (error) {
            request.log.error(error, "Failed to register device");
            
            return reply.code(500).send({
                success: false,
                message: "Internal server error",
                error: error instanceof Error ? error.message : "Unknown error"
            });
        }
    });

    // 删除已注册设备
    fastify.delete("/:serial", {
        schema: {
            description: "删除已注册的设备",
            tags: ["device"],
            params: {
                type: "object",
                properties: {
                    serial: {type: "string", description: "设备序列号"}
                }
            }
        }
    }, async (request: FastifyRequest<{Params: {serial: string}}>, reply) => {
        try {
            const {serial} = request.params;
            
            await prisma.device.delete({
                where: {serial_no: serial}
            });

            request.log.info({serial}, "Device deleted");
            return { success: true, message: "Device deleted successfully" };
        } catch (error) {
            request.log.error(error, "Failed to delete device");
            return reply.code(500).send({
                success: false,
                message: "Internal server error",
                error: error instanceof Error ? error.message : "Unknown error"
            });
        }
    });

    // 获取所有已注册设备
    fastify.get("/devices/registered", {
        schema: {
            description: "获取所有已注册的设备列表",
            tags: ["device"],
            querystring: {
                type: "object",
                properties: {
                    limit: {
                        type: "integer",
                        minimum: 1,
                        maximum: config.pagination.maxLimit,
                        default: config.pagination.defaultLimit,
                        description: "返回数量限制"
                    },
                    offset: {
                        type: "integer",
                        minimum: 0,
                        default: 0,
                        description: "偏移量"
                    }
                }
            }
        }
    }, async (request: FastifyRequest<{Querystring: {limit?: number; offset?: number}}>, reply) => {
        try {
            const {
                limit = config.pagination.defaultLimit,
                offset = 0
            } = request.query;

            const [total, devices] = await Promise.all([
                prisma.device.count(),
                prisma.device.findMany({
                    orderBy: {updatedAt: 'desc'},
                    take: limit,
                    skip: offset
                })
            ]);

            request.log.info({total, limit, offset}, "Retrieved device list");

            return {
                success: true,
                total,
                data: devices
            };
        } catch (error) {
            request.log.error(error, "Failed to get device list");
            
            return reply.code(500).send({
                success: false,
                message: "Internal server error"
            });
        }
    });

    // 扫描网络并自动添加设备
    fastify.post("/scan", async (request: FastifyRequest, reply) => {
        try {
            const checkPort = (ip: string, port: number, timeout = 1000): Promise<boolean> => {
                return new Promise((resolve) => {
                    const socket = new Socket();
                    socket.setTimeout(timeout);
                    socket.once('connect', () => {
                        socket.destroy();
                        resolve(true);
                    });
                    socket.once('timeout', () => {
                        socket.destroy();
                        resolve(false);
                    });
                    socket.once('error', () => {
                        resolve(false);
                    });
                    socket.connect(port, ip);
                });
            };

            const interfaces = os.networkInterfaces();
            const discovered: string[] = [];
            
            for (const name of Object.keys(interfaces)) {
                for (const net of interfaces[name] || []) {
                    if (net.family === 'IPv4' && !net.internal) {
                        const ipParts = net.address.split('.');
                        ipParts.pop();
                        const baseIp = ipParts.join('.');
                        
                        const promises = [];
                        for (let i = 1; i <= 254; i++) {
                            const ip = `${baseIp}.${i}`;
                            promises.push(checkPort(ip, 5555).then(async isOpen => {
                                if (isOpen) {
                                    const serial = `${ip}:5555`;
                                    discovered.push(serial);
                                    // 自动注册
                                    await prisma.device.upsert({
                                        where: {serial_no: serial},
                                        update: {},
                                        create: {serial_no: serial, adb_port: "5555"}
                                    });
                                }
                            }));
                        }
                        await Promise.all(promises);
                    }
                }
            }

            request.log.info({discovered}, "Network scan completed");
            return { success: true, message: `Scan complete. Found ${discovered.length} device(s)`, data: discovered };
        } catch (error) {
            request.log.error(error, "Failed to scan network");
            return reply.code(500).send({
                success: false,
                message: "Internal server error"
            });
        }
    });
}

