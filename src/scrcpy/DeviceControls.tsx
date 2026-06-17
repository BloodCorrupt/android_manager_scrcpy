import { AndroidKeyCode, AndroidKeyEventAction } from "@yume-chan/scrcpy";
import type { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from "@yume-chan/adb-scrcpy";
import {
    Home,
    Undo2,
    AppWindow,
    Volume2,
    Volume1,
    Power
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeviceControlsProps {
    clientRef: React.MutableRefObject<AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>> | null>;
}

export function DeviceControls({ clientRef }: DeviceControlsProps) {
    const sendKey = (keycode: AndroidKeyCode) => {
        const client = clientRef.current;
        if (!client?.controller) return;

        client.controller.injectKeyCode({
            action: AndroidKeyEventAction.Down,
            keyCode: keycode,
            repeat: 0,
            metaState: 0,
        });
        client.controller.injectKeyCode({
            action: AndroidKeyEventAction.Up,
            keyCode: keycode,
            repeat: 0,
            metaState: 0,
        });
    };

    return (
        <div className="w-full shrink-0 flex items-center justify-center gap-2 p-2 bg-black border-t border-white/10 z-50">
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.AndroidHome)}
                title="Home"
            >
                <Home className="h-5 w-5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.AndroidBack)}
                title="Back"
            >
                <Undo2 className="h-5 w-5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.AndroidAppSwitch)}
                title="Recent Apps"
            >
                <AppWindow className="h-5 w-5" />
            </Button>
            <div className="w-[1px] h-6 bg-white/20 mx-1" />
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.VolumeDown)}
                title="Volume Down"
            >
                <Volume1 className="h-5 w-5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.VolumeUp)}
                title="Volume Up"
            >
                <Volume2 className="h-5 w-5" />
            </Button>
            <div className="w-[1px] h-6 bg-white/20 mx-1" />
            <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 rounded-xl"
                onClick={() => sendKey(AndroidKeyCode.Power)}
                title="Power"
            >
                <Power className="h-5 w-5" />
            </Button>
        </div>
    );
}
