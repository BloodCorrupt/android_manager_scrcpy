/**
 * 服务器配置文件
 * 集中管理所有配置项，便于维护和部署
 */

// 从环境变量读取，提供默认值
export const config = {
    // 服务器配置
    server: {
        host: process.env.SERVER_HOST || "0.0.0.0",
        port: parseInt(process.env.VITE_SERVER_PORT || process.env.SERVER_PORT || "8080", 10),
    },
    
    // ADB 服务器配置
    adb: {
        host: process.env.ADB_HOST || "localhost",
        port: parseInt(process.env.ADB_PORT || "5037", 10),
        noDelay: true,
        keepAlive: true,
        keepAliveInitialDelay: 5000,
    },
    
    // CORS 配置
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
        preflight: true,
    },
    
    // Cookie 配置
    cookie: {
        secret: process.env.COOKIE_SECRET || "change-this-secret-in-production",
        parseOptions: {}
    },
    
    // WebSocket 配置
    websocket: {
        maxPayload: 1048576, // 1MB
        bufferThreshold: 1024 * 1024,      // 1MB
        drainTimeout: 30000,               // 30秒
        heartbeatInterval: 30000,          // 30秒
        heartbeatTimeout: 60000,           // 60秒
        maxMessageSize: 10 * 1024 * 1024,  // 10MB
        enableMetrics: true,
    },
    
    // 认证配置
    auth: {
        sessionToken: process.env.SESSION_TOKEN || "change-this-token-in-production",
        sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || String(7 * 24 * 60 * 60 * 1000), 10), // 7 days in ms
        cookieName: "session",
    },
    
    // 分页配置
    pagination: {
        defaultLimit: 50,
        maxLimit: 100,
    }
} as const;

// 环境检查
if (process.env.NODE_ENV === 'production') {
    if (config.cookie.secret === 'change-this-secret-in-production') {
        console.warn('⚠️  WARNING: Using default cookie secret in production!');
    }
    if (config.auth.sessionToken === 'change-this-token-in-production') {
        console.warn('⚠️  WARNING: Using default session token in production!');
    }
}

