import {useEffect, useRef} from "react";
import {AndroidKeyCode} from "@yume-chan/scrcpy";
import {ScrcpyKeyboardInjector} from "./input.ts";
import {AdbScrcpyClient, AdbScrcpyOptions3_3_3} from "@yume-chan/adb-scrcpy";

interface KeyboardControlProps {
    client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>> | null;
    enabled: boolean;
}

// 浏览器按键码映射到 Android 按键码
const KEY_CODE_MAP: Record<string, AndroidKeyCode> = {
    'Backspace': AndroidKeyCode.Backspace,
    'Enter': AndroidKeyCode.Enter,
    'Escape': AndroidKeyCode.Escape,
    'Space': AndroidKeyCode.Space,
    'ArrowLeft': AndroidKeyCode.ArrowLeft,
    'ArrowRight': AndroidKeyCode.ArrowRight,
    'ArrowUp': AndroidKeyCode.ArrowUp,
    'ArrowDown': AndroidKeyCode.ArrowDown,
    'Delete': AndroidKeyCode.Delete,
    'Home': AndroidKeyCode.Home,
    'End': AndroidKeyCode.End,
    'PageUp': AndroidKeyCode.PageUp,
    'PageDown': AndroidKeyCode.PageDown,
    'Tab': AndroidKeyCode.Tab,
    'Insert': AndroidKeyCode.Insert,
    'CapsLock': AndroidKeyCode.CapsLock,
    'NumLock': AndroidKeyCode.NumLock,
    'ScrollLock': AndroidKeyCode.ScrollLock,
    'PrintScreen': AndroidKeyCode.PrintScreen,
    'Pause': AndroidKeyCode.Pause,
    'ContextMenu': AndroidKeyCode.ContextMenu,

    // 字母
    'KeyA': AndroidKeyCode.KeyA,
    'KeyB': AndroidKeyCode.KeyB,
    'KeyC': AndroidKeyCode.KeyC,
    'KeyD': AndroidKeyCode.KeyD,
    'KeyE': AndroidKeyCode.KeyE,
    'KeyF': AndroidKeyCode.KeyF,
    'KeyG': AndroidKeyCode.KeyG,
    'KeyH': AndroidKeyCode.KeyH,
    'KeyI': AndroidKeyCode.KeyI,
    'KeyJ': AndroidKeyCode.KeyJ,
    'KeyK': AndroidKeyCode.KeyK,
    'KeyL': AndroidKeyCode.KeyL,
    'KeyM': AndroidKeyCode.KeyM,
    'KeyN': AndroidKeyCode.KeyN,
    'KeyO': AndroidKeyCode.KeyO,
    'KeyP': AndroidKeyCode.KeyP,
    'KeyQ': AndroidKeyCode.KeyQ,
    'KeyR': AndroidKeyCode.KeyR,
    'KeyS': AndroidKeyCode.KeyS,
    'KeyT': AndroidKeyCode.KeyT,
    'KeyU': AndroidKeyCode.KeyU,
    'KeyV': AndroidKeyCode.KeyV,
    'KeyW': AndroidKeyCode.KeyW,
    'KeyX': AndroidKeyCode.KeyX,
    'KeyY': AndroidKeyCode.KeyY,
    'KeyZ': AndroidKeyCode.KeyZ,

    // 数字
    'Digit0': AndroidKeyCode.Digit0,
    'Digit1': AndroidKeyCode.Digit1,
    'Digit2': AndroidKeyCode.Digit2,
    'Digit3': AndroidKeyCode.Digit3,
    'Digit4': AndroidKeyCode.Digit4,
    'Digit5': AndroidKeyCode.Digit5,
    'Digit6': AndroidKeyCode.Digit6,
    'Digit7': AndroidKeyCode.Digit7,
    'Digit8': AndroidKeyCode.Digit8,
    'Digit9': AndroidKeyCode.Digit9,

    // 符号键
    'Comma': AndroidKeyCode.Comma,
    'Period': AndroidKeyCode.Period,
    'Minus': AndroidKeyCode.Minus,
    'Equal': AndroidKeyCode.Equal,
    'BracketLeft': AndroidKeyCode.BracketLeft,
    'BracketRight': AndroidKeyCode.BracketRight,
    'Backslash': AndroidKeyCode.Backslash,
    'Semicolon': AndroidKeyCode.Semicolon,
    'Quote': AndroidKeyCode.Quote,
    'Slash': AndroidKeyCode.Slash,
    'Backquote': AndroidKeyCode.Backquote,

    // 功能键
    'F1': AndroidKeyCode.F1,
    'F2': AndroidKeyCode.F2,
    'F3': AndroidKeyCode.F3,
    'F4': AndroidKeyCode.F4,
    'F5': AndroidKeyCode.F5,
    'F6': AndroidKeyCode.F6,
    'F7': AndroidKeyCode.F7,
    'F8': AndroidKeyCode.F8,
    'F9': AndroidKeyCode.F9,
    'F10': AndroidKeyCode.F10,
    'F11': AndroidKeyCode.F11,
    'F12': AndroidKeyCode.F12,

    // 小键盘数字
    'Numpad0': AndroidKeyCode.Numpad0,
    'Numpad1': AndroidKeyCode.Numpad1,
    'Numpad2': AndroidKeyCode.Numpad2,
    'Numpad3': AndroidKeyCode.Numpad3,
    'Numpad4': AndroidKeyCode.Numpad4,
    'Numpad5': AndroidKeyCode.Numpad5,
    'Numpad6': AndroidKeyCode.Numpad6,
    'Numpad7': AndroidKeyCode.Numpad7,
    'Numpad8': AndroidKeyCode.Numpad8,
    'Numpad9': AndroidKeyCode.Numpad9,

    // 小键盘运算符
    'NumpadDivide': AndroidKeyCode.NumpadDivide,
    'NumpadMultiply': AndroidKeyCode.NumpadMultiply,
    'NumpadSubtract': AndroidKeyCode.NumpadSubtract,
    'NumpadAdd': AndroidKeyCode.NumpadAdd,
    'NumpadDecimal': AndroidKeyCode.NumpadDecimal,
    'NumpadEnter': AndroidKeyCode.NumpadEnter,

    // 修饰键
    'ShiftLeft': AndroidKeyCode.ShiftLeft,
    'ShiftRight': AndroidKeyCode.ShiftRight,
    'ControlLeft': AndroidKeyCode.ControlLeft,
    'ControlRight': AndroidKeyCode.ControlRight,
    'AltLeft': AndroidKeyCode.AltLeft,
    'AltRight': AndroidKeyCode.AltRight,
    'MetaLeft': AndroidKeyCode.MetaLeft,
    'MetaRight': AndroidKeyCode.MetaRight,
};

export function KeyboardControl({client, enabled}: KeyboardControlProps) {
    const keyboardInjectorRef = useRef<ScrcpyKeyboardInjector | null>(null);

    useEffect(() => {
        if (!client || !enabled) return;

        // 创建键盘注入器
        const keyboard = new ScrcpyKeyboardInjector(client);
        keyboardInjectorRef.current = keyboard;

        const handleKeyDown = async (e: KeyboardEvent) => {
            // Ignore events if user is typing in an input field or textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // 特殊处理：Ctrl+V 粘贴剪贴板内容
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
                e.preventDefault();
                e.stopPropagation();

                try {
                    // 读取浏览器剪贴板内容
                    const text = await navigator.clipboard.readText();
                    if (text && client?.controller) {
                        // 通过剪贴板方式实现粘贴（支持中文）
                        // 1. 将文本设置到设备剪贴板
                        await client.controller.setClipboard({
                            sequence: 0n,  // 0n 表示不等待设备确认
                            paste: true,  // false 表示只设置剪贴板，不自动粘贴
                            content: text
                        });


                    }
                } catch (err) {
                    console.error('Paste failed:', err);
                    console.warn('Make sure clipboard read permission is granted');
                }
                return;
            }

            // Send printable characters directly via injectText to bypass Android layout mismatch
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                if (client?.controller) {
                    await client.controller.injectText(e.key);
                }
                return;
            }

            // 阻止默认行为（如浏览器快捷键）
            const androidKey = KEY_CODE_MAP[e.code];
            if (androidKey) {
                e.preventDefault();
                e.stopPropagation();
                await keyboard.down(androidKey);
            }
        };

        const handleKeyUp = async (e: KeyboardEvent) => {
            // Ignore events if user is typing in an input field or textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Ctrl+V 在 keydown 中已处理，keyup 时直接返回
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Do not send keyup for printable characters handled by injectText
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const androidKey = KEY_CODE_MAP[e.code];
            if (androidKey) {
                e.preventDefault();
                e.stopPropagation();
                await keyboard.up(androidKey);
            }
        };

        // 添加全局键盘监听器
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            // 清理
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            keyboard.reset();
            keyboard.dispose();
            keyboardInjectorRef.current = null;
        };
    }, [client, enabled]);

    return null; // 此组件不渲染任何 UI
}

