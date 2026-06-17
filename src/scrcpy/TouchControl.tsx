import {
    AndroidMotionEventAction,
    AndroidMotionEventButton,
    ScrcpyPointerId,
} from "@yume-chan/scrcpy";
import {type MouseEvent, type PointerEvent, useCallback, useEffect, useRef} from "react";
import {AndroidKeyCode, AndroidKeyEventAction} from "@yume-chan/scrcpy";
import {AdbScrcpyClient, AdbScrcpyOptions3_3_3} from "@yume-chan/adb-scrcpy";
import * as React from "react";

const MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON = [
    AndroidMotionEventButton.Primary,
    AndroidMotionEventButton.Tertiary,
    AndroidMotionEventButton.Secondary,
    AndroidMotionEventButton.Back,
    AndroidMotionEventButton.Forward,
];

interface TouchControlProps {
    client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>> | null;
    screenWidth: number;
    screenHeight: number;
    rotation?: number; // 屏幕旋转角度（度数）：0, 90, 180, 270
    children?: React.ReactNode;
}

export function TouchControl({client, screenWidth, screenHeight, rotation = 0, children}: TouchControlProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 客户端坐标转设备坐标（支持旋转）
     * @param clientX 浏览器客户端 X 坐标
     * @param clientY 浏览器客户端 Y 坐标
     * @returns 设备坐标 {x, y}
     */
    const clientPositionToDevicePosition = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current) return {x: 0, y: 0};

        const viewRect = containerRef.current.getBoundingClientRect();
        
        // 归一化坐标（0-1）
        const normalizedX = Math.max(0, Math.min(1, (clientX - viewRect.x) / viewRect.width));
        const normalizedY = Math.max(0, Math.min(1, (clientY - viewRect.y) / viewRect.height));

        let deviceX: number, deviceY: number;
        
        // 根据旋转角度转换坐标
        switch (rotation) {
            case 90:
                // 顺时针旋转 90°
                deviceX = screenWidth * normalizedY;
                deviceY = screenHeight * (1 - normalizedX);
                break;
            case 180:
                // 旋转 180°
                deviceX = screenWidth * (1 - normalizedX);
                deviceY = screenHeight * (1 - normalizedY);
                break;
            case 270:
                // 顺时针旋转 270°（逆时针 90°）
                deviceX = screenWidth * (1 - normalizedY);
                deviceY = screenHeight * normalizedX;
                break;
            default:
                // 无旋转（0°）
                deviceX = screenWidth * normalizedX;
                deviceY = screenHeight * normalizedY;
        }

        return {x: deviceX, y: deviceY};
    }, [screenWidth, screenHeight, rotation]);

    // 注入触摸事件
    const injectTouch = (action: AndroidMotionEventAction, e: PointerEvent<HTMLDivElement>) => {
        if (!client?.controller) return;

        const {pointerType} = e;
        let pointerId: bigint;
        if (pointerType === "mouse") {
            // Android 13 has bug with mouse injection
            pointerId = ScrcpyPointerId.Finger;
        } else {
            pointerId = BigInt(e.pointerId);
        }

        const {x, y} = clientPositionToDevicePosition(e.clientX, e.clientY);

        // 发送触摸事件（使用当前视频尺寸）
        client.controller?.injectTouch({
            action: action,
            pointerId: pointerId,
            videoWidth: screenWidth,
            videoHeight: screenHeight,
            pointerX: x,
            pointerY: y,
            pressure: e.pressure,
            actionButton: MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON[e.button],
            buttons: e.buttons,
        });
    };

    // 处理鼠标按下
    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!client?.controller) return;

        e.preventDefault();
        e.stopPropagation();

        if (e.button === 2) {
            // Right-click: trigger Back button
            client.controller.injectKeyCode({
                action: AndroidKeyEventAction.Down,
                keyCode: AndroidKeyCode.AndroidBack,
                repeat: 0,
                metaState: 0,
            });
            client.controller.injectKeyCode({
                action: AndroidKeyEventAction.Up,
                keyCode: AndroidKeyCode.AndroidBack,
                repeat: 0,
                metaState: 0,
            });
            return;
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        injectTouch(AndroidMotionEventAction.Down, e);
    };

    // 处理鼠标移动
    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!client?.controller) return;

        e.preventDefault();
        e.stopPropagation();
        injectTouch(
            e.buttons === 0
                ? AndroidMotionEventAction.HoverMove
                : AndroidMotionEventAction.Move,
            e
        );
    };

    // 处理鼠标释放
    const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (!client?.controller) return;

        e.preventDefault();
        e.stopPropagation();
        injectTouch(AndroidMotionEventAction.Up, e);
    };

    // 处理鼠标离开
    const handlePointerLeave = (e: PointerEvent<HTMLDivElement>) => {
        if (!client?.controller) return;

        e.preventDefault();
        e.stopPropagation();
        // Release the injected pointer, otherwise it will stuck at the last position.
        injectTouch(AndroidMotionEventAction.HoverExit, e);
        injectTouch(AndroidMotionEventAction.Up, e);
    };

    // 处理右键菜单
    const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    // 使用原生事件监听器处理 wheel，设置 passive: false
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (!client?.controller) return;

            e.preventDefault();
            e.stopPropagation();

            // 使用统一的坐标转换方法
            const {x, y} = clientPositionToDevicePosition(e.clientX, e.clientY);

            // 使用当前视频尺寸
            client.controller?.injectScroll({
                videoWidth: screenWidth,
                videoHeight: screenHeight,
                pointerX: x,
                pointerY: y,
                scrollX: -e.deltaX / 100,
                scrollY: -e.deltaY / 100,
                buttons: 0,
            });
        };

        container.addEventListener('wheel', handleWheel, {passive: false});

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [client, screenWidth, screenHeight, rotation, clientPositionToDevicePosition]);

    return (
        <div
            ref={containerRef}
            style={{
                transformOrigin: "center center",
                touchAction: "none",
                userSelect: "none",
                position: "relative",
                width: "100%",
                height: "100%",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={handleContextMenu}
        >
            {children}
        </div>
    );
}

