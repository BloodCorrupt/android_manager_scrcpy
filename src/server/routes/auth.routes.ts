/**
 * 认证路由
 * 处理密码设置、登录、登出和状态检查
 */

import type {FastifyInstance, FastifyRequest} from "fastify";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {randomBytes} from "node:crypto";
import {config} from "../config.js";

const SALT_ROUNDS = 12;

export async function authRoutes(fastify: FastifyInstance, prisma: PrismaClient) {

    /**
     * GET /auth/status
     * 检查认证状态：密码是否已设置 + 当前会话是否有效
     */
    fastify.get("/auth/status", async (request, reply) => {
        try {
            // 检查是否已设置密码
            const adminAuth = await prisma.adminAuth.findUnique({
                where: {id: 1}
            });

            const isSetup = !!adminAuth;

            // 检查当前会话是否有效
            let isAuthenticated = false;
            const token = request.cookies[config.auth.cookieName];

            if (token) {
                const session = await prisma.session.findUnique({
                    where: {token}
                });

                if (session && new Date() < session.expiresAt) {
                    isAuthenticated = true;
                }
            }

            return {
                isSetup,
                isAuthenticated
            };
        } catch (error) {
            request.log.error(error, "Failed to check auth status");
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "Failed to check authentication status"
            });
        }
    });

    /**
     * POST /auth/setup
     * 首次运行：设置管理员密码（仅在未设置密码时可用）
     */
    fastify.post("/auth/setup", async (request: FastifyRequest<{Body: {password: string}}>, reply) => {
        try {
            // 检查是否已设置密码
            const existing = await prisma.adminAuth.findUnique({
                where: {id: 1}
            });

            if (existing) {
                return reply.code(409).send({
                    error: "Conflict",
                    message: "Password already configured. Use /auth/login instead."
                });
            }

            const {password} = request.body;

            if (!password || password.length < 4) {
                return reply.code(400).send({
                    error: "Validation Error",
                    message: "Password must be at least 4 characters long."
                });
            }

            // 哈希密码并存储
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            await prisma.adminAuth.create({
                data: {
                    id: 1,
                    password_hash: passwordHash
                }
            });

            // 创建会话
            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + config.auth.sessionMaxAge);

            await prisma.session.create({
                data: {token, expiresAt}
            });

            request.log.info("Admin password configured successfully");

            // 设置 session cookie
            reply.setCookie(config.auth.cookieName, token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: config.auth.sessionMaxAge / 1000, // cookie maxAge is in seconds
            });

            return {
                success: true,
                message: "Password configured successfully"
            };
        } catch (error) {
            request.log.error(error, "Failed to setup password");
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "Failed to configure password"
            });
        }
    });

    /**
     * POST /auth/login
     * 登录：验证密码，创建会话
     */
    fastify.post("/auth/login", async (request: FastifyRequest<{Body: {password: string}}>, reply) => {
        try {
            const adminAuth = await prisma.adminAuth.findUnique({
                where: {id: 1}
            });

            if (!adminAuth) {
                return reply.code(404).send({
                    error: "Not Found",
                    message: "No password configured. Use /auth/setup first."
                });
            }

            const {password} = request.body;

            if (!password) {
                return reply.code(400).send({
                    error: "Validation Error",
                    message: "Password is required."
                });
            }

            // 验证密码
            const isValid = await bcrypt.compare(password, adminAuth.password_hash);

            if (!isValid) {
                return reply.code(401).send({
                    error: "Unauthorized",
                    message: "Invalid password."
                });
            }

            // 创建新会话
            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + config.auth.sessionMaxAge);

            await prisma.session.create({
                data: {token, expiresAt}
            });

            // 清理过期会话（后台清理，不影响响应）
            prisma.session.deleteMany({
                where: {expiresAt: {lt: new Date()}}
            }).catch(err => {
                request.log.warn(err, "Failed to cleanup expired sessions");
            });

            request.log.info("Admin logged in successfully");

            // 设置 session cookie
            reply.setCookie(config.auth.cookieName, token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: config.auth.sessionMaxAge / 1000,
            });

            return {
                success: true,
                message: "Login successful"
            };
        } catch (error) {
            request.log.error(error, "Login failed");
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "Login failed"
            });
        }
    });

    /**
     * POST /auth/logout
     * 登出：删除当前会话
     */
    fastify.post("/auth/logout", async (request, reply) => {
        try {
            const token = request.cookies[config.auth.cookieName];

            if (token) {
                await prisma.session.deleteMany({
                    where: {token}
                });
            }

            // 清除 cookie
            reply.clearCookie(config.auth.cookieName, {
                path: "/",
            });

            request.log.info("Admin logged out");

            return {
                success: true,
                message: "Logged out successfully"
            };
        } catch (error) {
            request.log.error(error, "Logout failed");
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "Logout failed"
            });
        }
    });
}
