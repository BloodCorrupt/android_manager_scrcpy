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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl z-50 hover:bg-black/50 transition-colors">
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
