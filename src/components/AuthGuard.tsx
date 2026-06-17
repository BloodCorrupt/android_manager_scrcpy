/**
 * 认证守卫组件
 * 检查认证状态，未认证时显示登录页面
 */

import {useEffect} from 'react';
import {useAuth} from '../lib/useAuth';
import LoginPage from './LoginPage';
import {Spinner} from './ui/spinner';

interface AuthGuardProps {
    children: React.ReactNode;
    onLogout?: () => void;
}

export default function AuthGuard({children, onLogout}: AuthGuardProps) {
    const {
        isAuthenticated,
        needsSetup,
        isLoading,
        error,
        checkAuth,
        login,
        setup,
        logout,
    } = useAuth();

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // 将 logout 函数暴露给父组件
    useEffect(() => {
        if (onLogout) {
            // 通过 window 事件传递 logout 函数（简单方式避免 context 复杂性）
            (window as any).__authLogout = async () => {
                await logout();
                await checkAuth();
            };
        }

        return () => {
            delete (window as any).__authLogout;
        };
    }, [logout, checkAuth, onLogout]);

    // 加载中
    if (isLoading && !needsSetup && !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Spinner className="h-8 w-8"/>
                    <p className="text-sm text-muted-foreground">Checking authentication...</p>
                </div>
            </div>
        );
    }

    // 未认证或需要设置：显示登录页面
    if (!isAuthenticated) {
        return (
            <LoginPage
                needsSetup={needsSetup}
                onLogin={login}
                onSetup={setup}
                error={error}
                isLoading={isLoading}
            />
        );
    }

    // 已认证：显示子组件
    return <>{children}</>;
}
