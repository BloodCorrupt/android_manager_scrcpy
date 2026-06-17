/**
 * 登录/设置密码页面
 * 首次运行显示设置模式，后续运行显示登录模式
 * 使用 glassmorphism 设计风格
 */

import {useState, useEffect, useRef} from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './ui/card';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Button} from './ui/button';
import {Spinner} from './ui/spinner';
import {AlertCircle, Lock, Shield, Eye, EyeOff, Smartphone} from 'lucide-react';

interface LoginPageProps {
    needsSetup: boolean;
    onLogin: (password: string) => Promise<boolean>;
    onSetup: (password: string) => Promise<boolean>;
    error: string | null;
    isLoading: boolean;
}

export default function LoginPage({needsSetup, onLogin, onSetup, error, isLoading}: LoginPageProps) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // 自动聚焦密码输入框
        inputRef.current?.focus();
    }, [needsSetup]);

    const displayError = localError || error;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (!password) {
            setLocalError('Please enter a password');
            return;
        }

        if (needsSetup) {
            if (password.length < 4) {
                setLocalError('Password must be at least 4 characters');
                return;
            }
            if (password !== confirmPassword) {
                setLocalError('Passwords do not match');
                return;
            }
            setIsSubmitting(true);
            await onSetup(password);
            setIsSubmitting(false);
        } else {
            setIsSubmitting(true);
            await onLogin(password);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Dynamic background */}
            <div className="login-bg-gradient"/>
            <div className="login-bg-orb login-bg-orb-1"/>
            <div className="login-bg-orb login-bg-orb-2"/>
            <div className="login-bg-orb login-bg-orb-3"/>

            {/* Main card */}
            <Card className="login-card w-full max-w-md relative z-10">
                <CardHeader className="text-center space-y-4 pb-2">
                    {/* Logo / Icon */}
                    <div className="flex justify-center">
                        <div className="login-icon-wrapper">
                            {needsSetup ? (
                                <Shield className="h-8 w-8 text-blue-400"/>
                            ) : (
                                <Lock className="h-8 w-8 text-blue-400"/>
                            )}
                        </div>
                    </div>

                    <div>
                        <CardTitle className="text-2xl font-bold tracking-tight">
                            {needsSetup ? 'Security Setup' : 'Welcome Back'}
                        </CardTitle>
                        <CardDescription className="mt-2 text-sm">
                            {needsSetup
                                ? 'First run — set an admin password to protect your device management panel'
                                : 'Enter your admin password to access the device management panel'
                            }
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Error banner */}
                        {displayError && (
                            <div className="login-error-banner flex items-center gap-2 p-3 rounded-lg text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0"/>
                                <span>{displayError}</span>
                            </div>
                        )}

                        {/* Password input */}
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium">
                                {needsSetup ? 'Set Password' : 'Admin Password'}
                            </Label>
                            <div className="relative">
                                <Input
                                    ref={inputRef}
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={needsSetup ? 'Enter new password (min 4 characters)' : 'Enter password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setLocalError(null);
                                    }}
                                    className="login-input pr-10"
                                    disabled={isSubmitting || isLoading}
                                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </button>
                            </div>
                        </div>

                        {/* Confirm password (setup mode only) */}
                        {needsSetup && (
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password" className="text-sm font-medium">
                                    Confirm Password
                                </Label>
                                <Input
                                    id="confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Re-enter password"
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        setLocalError(null);
                                    }}
                                    className="login-input"
                                    disabled={isSubmitting || isLoading}
                                    autoComplete="new-password"
                                />
                            </div>
                        )}

                        {/* 提交按钮 */}
                        <Button
                            type="submit"
                            className="login-submit-btn w-full"
                            disabled={isSubmitting || isLoading || !password}
                        >
                            {(isSubmitting || isLoading) ? (
                                <Spinner className="h-4 w-4 mr-2"/>
                            ) : null}
                            {needsSetup ? 'Set Password & Enter' : 'Login'}
                        </Button>
                    </form>

                    {/* 底部标识 */}
                    <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
                        <Smartphone className="h-3 w-3"/>
                        <span>Android Device Manager</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
