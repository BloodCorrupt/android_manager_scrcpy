/**
 * 认证 Hook
 * 提供认证状态检查、登录、设置和登出功能
 */

import {useState, useCallback} from 'react';

// In development, point to the backend port (from .env or 8080). In production, use relative paths.
const isDev = import.meta.env.DEV;
const apiPort = import.meta.env.VITE_SERVER_PORT || 8080;
const API_BASE = isDev ? `${window.location.protocol}//${window.location.hostname}:${apiPort}/api` : '/api';

interface AuthState {
    isAuthenticated: boolean;
    needsSetup: boolean;
    isLoading: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        needsSetup: false,
        isLoading: true,
        error: null,
    });

    /**
     * 检查认证状态
     */
    const checkAuth = useCallback(async () => {
        setState(prev => ({...prev, isLoading: true, error: null}));
        try {
            const response = await fetch(`${API_BASE}/auth/status`, {
                credentials: 'include',
            });
            
            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }

            const data = await response.json();
            setState({
                isAuthenticated: data.isAuthenticated,
                needsSetup: !data.isSetup,
                isLoading: false,
                error: null,
            });
            return data;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to check auth status';
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: message,
            }));
            return null;
        }
    }, []);

    /**
     * 首次设置密码
     */
    const setup = useCallback(async (password: string): Promise<boolean> => {
        setState(prev => ({...prev, isLoading: true, error: null}));
        try {
            const response = await fetch(`${API_BASE}/auth/setup`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({password}),
            });

            const data = await response.json();

            if (!response.ok) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: data.message || 'Setup failed',
                }));
                return false;
            }

            setState({
                isAuthenticated: true,
                needsSetup: false,
                isLoading: false,
                error: null,
            });
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Setup failed';
            setState(prev => ({...prev, isLoading: false, error: message}));
            return false;
        }
    }, []);

    /**
     * 登录
     */
    const login = useCallback(async (password: string): Promise<boolean> => {
        setState(prev => ({...prev, isLoading: true, error: null}));
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({password}),
            });

            const data = await response.json();

            if (!response.ok) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: data.message || 'Invalid password',
                }));
                return false;
            }

            setState({
                isAuthenticated: true,
                needsSetup: false,
                isLoading: false,
                error: null,
            });
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            setState(prev => ({...prev, isLoading: false, error: message}));
            return false;
        }
    }, []);

    /**
     * 登出
     */
    const logout = useCallback(async (): Promise<void> => {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch {
            // 即使请求失败，也清除本地状态
        }

        setState({
            isAuthenticated: false,
            needsSetup: false,
            isLoading: false,
            error: null,
        });
    }, []);

    return {
        ...state,
        checkAuth,
        setup,
        login,
        logout,
    };
}
