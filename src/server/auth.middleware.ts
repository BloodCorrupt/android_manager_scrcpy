/**
 * 认证中间件
 * 验证请求中的 session cookie，保护所有 API 路由和 WebSocket 连接
 */

import type {FastifyInstance, FastifyRequest, FastifyReply} from "fastify";
// @ts-ignore
import {PrismaClient} from "@prisma/client";
import {config} from "./config.js";

// 不需要认证的路由前缀
const PUBLIC_PATHS = ["/auth/", "/health"];

/**
 * 检查路径是否为公开路径（不需要认证）
 */
function isPublicPath(url: string): boolean {
    return PUBLIC_PATHS.some(path => url.startsWith(path));
}

/**
 * 注册认证中间件
 */
export function registerAuthMiddleware(fastify: FastifyInstance, prisma: PrismaClient) {
    fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        // 跳过公开路径
        if (isPublicPath(request.url)) {
            return;
        }

        // 跳过根路径健康检查
        if (request.url === "/" || request.url === "/health") {
            return;
        }

        // 获取 session token
        const token = request.cookies[config.auth.cookieName];

        if (!token) {
            return reply.code(401).send({
                error: "Unauthorized",
                message: "No session token provided. Please login first."
            });
        }

        // 验证 session
        try {
            const session = await prisma.session.findUnique({
                where: {token}
            });

            if (!session) {
                return reply.code(401).send({
                    error: "Unauthorized",
                    message: "Invalid session. Please login again."
                });
            }

            // 检查是否过期
            if (new Date() > session.expiresAt) {
                // 清理过期 session
                await prisma.session.delete({where: {id: session.id}}).catch(() => {});
                return reply.code(401).send({
                    error: "Unauthorized",
                    message: "Session expired. Please login again."
                });
            }
        } catch (error) {
            request.log.error(error, "Session validation failed");
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "Failed to validate session"
            });
        }
    });
}
