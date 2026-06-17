import Fastify from "fastify";
// @ts-ignore
import {PrismaClient} from "@prisma/client";
import websocketPlugin from "@fastify/websocket";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import {config} from "./config.js";
import {deviceRoutes} from "./routes/device.routes.js";
import {adbRoutes} from "./routes/adb.routes.js";
import {authRoutes} from "./routes/auth.routes.js";
import {registerAuthMiddleware} from "./auth.middleware.js";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 尝试加载 SSL 证书
const certPath = path.resolve(__dirname, '../../certs/cert.pem');
const keyPath = path.resolve(__dirname, '../../certs/key.pem');

// 初始化 Fastify
// 可选：使用 autoLoggerSimple 如果不想使用 pino-pretty
const fastify = Fastify({
    http2: true,
    https: {
        allowHTTP1: true,
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    },
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                colorize: true,
                singleLine: true
            }
        }
    },
});

// 注册插件
await fastify.register(websocketPlugin, {options: {maxPayload: config.websocket.maxPayload}});

await fastify.register(cookie, config.cookie);

await fastify.register(cors, config.cors);

// Serve static frontend files from dist directory
const distPath = path.resolve(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
    await fastify.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
    });
    
    // Fallback for SPA routing
    fastify.setNotFoundHandler((request, reply) => {
        if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/auth/')) {
            return reply.sendFile('index.html');
        }
        reply.status(404).send({
            error: "Not Found",
            message: `Route ${request.method} ${request.url} not found`
        });
    });
} else {
    // 404 处理 (Fallback if no dist folder)
    fastify.setNotFoundHandler((request, reply) => {
        reply.status(404).send({
            error: "Not Found",
            message: `Route ${request.method} ${request.url} not found`
        });
    });
}

// 添加安全头以支持 SharedArrayBuffer 和 AudioWorklet
fastify.addHook('onRequest', async (_request, reply) => {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
});

// 初始化 Prisma
const prisma = new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['query', 'error', 'warn'] : ['error']
});

// 测试数据库连接
try {
    await prisma.$connect();
    fastify.log.info('Database connected');
} catch (error) {
    fastify.log.error(error, 'Database connection failed');
    process.exit(1);
}

// 健康检查路由保留 /health

fastify.get("/health", async () => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return {
            status: "healthy",
            database: "connected",
            uptime: process.uptime()
        };
    } catch (error) {
        return {
            status: "unhealthy",
            database: "disconnected",
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
});


// 注册认证路由（公开路由，不需要认证）
await fastify.register(async (fastify) => {
    await authRoutes(fastify, prisma);
}, { prefix: '/api' });

// 注册认证中间件（保护后续所有路由）
registerAuthMiddleware(fastify as any, prisma);

await fastify.register(async (fastify) => {
    await deviceRoutes(fastify, prisma);
}, { prefix: '/api' });

await fastify.register(async (fastify) => {
    await adbRoutes(fastify);
}, { prefix: '/api' });

// 全局错误处理
fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    // 验证错误
    if (error.validation) {
        return reply.status(400).send({
            error: "Validation Error",
            message: error.message,
            details: error.validation
        });
    }

    // 其他错误
    reply.status(error.statusCode || 500).send({
        error: error.name || "Internal Server Error",
        message: error.message || "An unexpected error occurred"
    });
});

// 404 handler moved to static file serving logic above

// 启动服务器
try {
    await fastify.listen({host: config.server.host, port: config.server.port});
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}

// 优雅关闭
const signals = ['SIGINT', 'SIGTERM'] as const;

for (const signal of signals) {
    process.on(signal, async () => {
        fastify.log.info(`Received ${signal}, starting graceful shutdown...`);

        try {
            // 关闭 Fastify（会自动触发所有 onClose 钩子）
            await fastify.close();
            fastify.log.info('Server closed');

            // 断开 Prisma
            await prisma.$disconnect();
            fastify.log.info('Database disconnected');

            process.exit(0);
        } catch (error) {
            fastify.log.error(error, 'Error during shutdown');
            process.exit(1);
        }
    });
}

// 未捕获异常处理
process.on('uncaughtException', (error) => {
    fastify.log.fatal(error, 'Uncaught exception');
    // process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    fastify.log.fatal(reason, 'Unhandled promise rejection');
    // process.exit(1);
});

