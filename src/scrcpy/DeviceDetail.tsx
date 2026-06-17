import {WebSocketTransport} from "@/server/transport/websocket-transport";
import {Adb, AdbBanner} from "@yume-chan/adb";
import {
    AndroidKeyCode,
    AndroidKeyEventAction,
    DefaultServerPath,
    ScrcpyVideoCodecId
} from "@yume-chan/scrcpy";
import type {ScrcpyControlMessageWriter} from "@yume-chan/scrcpy";
import {AdbScrcpyClient, AdbScrcpyOptions3_3_3} from "@yume-chan/adb-scrcpy";
import {WritableStream} from "@yume-chan/stream-extra";
import {AudioManager} from "./AudioManager";
import {
    BitmapVideoFrameRenderer,
    InsertableStreamVideoFrameRenderer,
    type VideoFrameRenderer,
    WebCodecsVideoDecoder,
    WebGLVideoFrameRenderer
} from "@yume-chan/scrcpy-decoder-webcodecs";
import {useEffect, useRef, useState} from "react";
import {useParams, useNavigate} from 'react-router-dom';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '../components/ui/card';
import {Spinner} from '../components/ui/spinner';
import {Button} from '../components/ui/button';
import {AlertCircle, ArrowLeft, Home, ChevronLeft, Square, Power, Volume2, VolumeOff, RectangleVertical} from 'lucide-react';
import {TouchControl} from './TouchControl';
import {KeyboardControl} from './KeyboardControl';
import type {DeviceResponse, DeviceInfo} from '../types/device.types';
import {isMobileDevice} from '../lib/device-detect';


function createVideoFrameRenderer(): {
    renderer: VideoFrameRenderer;
    element: HTMLVideoElement | HTMLCanvasElement;
} {
    if (InsertableStreamVideoFrameRenderer.isSupported) {
        const renderer = new InsertableStreamVideoFrameRenderer();
        return {renderer, element: renderer.element};
    }

    if (WebGLVideoFrameRenderer.isSupported) {
        const renderer = new WebGLVideoFrameRenderer();
        return {renderer, element: renderer.canvas as HTMLCanvasElement};
    }

    const renderer = new BitmapVideoFrameRenderer();
    return {renderer, element: renderer.canvas as HTMLCanvasElement};
}

export default function DeviceDetail() {
    const {serial} = useParams<{ serial: string }>();
    const navigate = useNavigate();

    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const controllerRef = useRef<ScrcpyControlMessageWriter | null>(null);
    const scrcpyClientRef = useRef<AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>>>(null);
    const isMutedRef = useRef<boolean>(true); // Use ref to keep latest mute state, avoiding closure issues
    const audioManagerRef = useRef<AudioManager | null>(null); // Audio manager

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [screenSize, setScreenSize] = useState<{ width: number; height: number }>(); // Physical size (fixed, portrait dimensions)
    const [videoSize, setVideoSize] = useState<{ width: number; height: number }>(); // Video size (changes with rotation)
    const [isLandscape, setIsLandscape] = useState(false); // Whether landscape mode
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // Default muted, wait for user to activate
    const [audioAvailable, setAudioAvailable] = useState(true); // Whether audio is available
    const [audioError, setAudioError] = useState(false); // Whether audio errored
    const [isMobile, setIsMobile] = useState(false); // Whether mobile device

    // Key press handler
    const handleKeyPress = (keyCode: AndroidKeyCode) => {
        if (!controllerRef.current) {
            console.warn('Controller not initialized');
            return;
        }

        try {
            // Key down
            controllerRef.current.injectKeyCode({
                action: AndroidKeyEventAction.Down,
                keyCode: keyCode,
                repeat: 0,
                metaState: 0,
            });

            // Key up
            controllerRef.current.injectKeyCode({
                action: AndroidKeyEventAction.Up,
                keyCode: keyCode,
                repeat: 0,
                metaState: 0,
            });
        } catch (error) {
            console.error('Failed to send key event:', error);
        }
    };

    useEffect(() => {
        // Detect mobile device
        setIsMobile(isMobileDevice());

        // Capture current ref value for cleanup function (avoid closure issues)
        const wrapper = wrapperRef.current;

        if (!serial) {
            setError('Missing device serial number');
            setIsLoading(false);
            return;
        }


        const initializeDevice = async () => {
            try {
                const response = await fetch(`${window.location.protocol}//${window.location.hostname}:8080/device/${serial}`);
                if (!response.ok) {
                    throw new Error(`Failed to get device info: ${response.status}`);
                }

                const data: DeviceResponse = await response.json();
                setDeviceInfo(data.info);

                console.log(`Device info:`, data);
                if (data.info.screen_width && data.info.screen_height) {
                    // Save physical size (always portrait dimensions, used for placeholder)
                    const physicalWidth = Math.min(data.info.screen_width, data.info.screen_height);
                    const physicalHeight = Math.max(data.info.screen_width, data.info.screen_height);
                    setScreenSize({
                        width: physicalWidth,
                        height: physicalHeight
                    });
                }
                setIsLoading(false);

                const transport = new WebSocketTransport(
                    serial,
                    data.maxPayloadSize,
                    new AdbBanner(data.product, data.model, data.device, data.features),
                );

                const adb = new Adb(transport);

                const scrcpy = await AdbScrcpyClient.start(
                    adb,
                    DefaultServerPath,
                    new AdbScrcpyOptions3_3_3({
                        videoBitRate: 8388608,
                        displayId: 0,
                        maxFps: 60,
                        videoSource: "display",
                        videoCodec: "h264",
                        audio: true,
                        // audioCodec: "opus",
                        // audioBitRate: 128000,
                        control: true,
                        tunnelForward: true,
                        stayAwake: true,
                        powerOffOnClose: false,
                        powerOn: false,
                        clipboardAutosync: true,
                        sendDeviceMeta: true,
                        cleanup: true
                    }),
                );

                // 保存 scrcpy 客户端和控制器引用
                scrcpyClientRef.current = scrcpy;
                if (scrcpy.controller) {
                    controllerRef.current = scrcpy.controller;
                }

                // Initialize audio stream
                const initAudioStream = async () => {
                    try {
                        const audioStreamPromise = scrcpy.audioStream;
                        if (!audioStreamPromise) {
                            console.warn(`Device does not support audio stream`);
                            setAudioAvailable(false);
                            return;
                        }

                        const metadata = await audioStreamPromise;
                        if (metadata.type === 'disabled' || metadata.type === 'errored') {
                            console.warn(`Audio unavailable:`, metadata.type);
                            setAudioAvailable(false);
                            if (metadata.type === 'errored') {
                                setAudioError(true);
                            }
                            return;
                        }

                        console.log(`Audio codec:`, metadata.codec);

                        // Create audio manager and initialize
                        const audioManager = new AudioManager(isMutedRef);
                        audioManager.initialize(metadata.codec, metadata.codec.webCodecId, metadata.stream);
                        audioManagerRef.current = audioManager;

                        setAudioAvailable(true);
                        setAudioError(false);
                    } catch (error: unknown) {
                        const err = error as Error;
                        console.warn(`Audio initialization failed (video unaffected):`, err.message || error);
                        setAudioAvailable(false);
                        setAudioError(true);
                    }
                };

                // Start audio initialization (don't await completion)
                void initAudioStream();

                const stream = scrcpy.videoStream!;
                stream.then(async ({stream}) => {
                    const {renderer, element} = createVideoFrameRenderer();

                    if (wrapperRef.current) {
                        // Clear previous content (on hot reload)
                        wrapperRef.current.innerHTML = '';

                        element.style.display = 'block';
                        element.style.width = '100%';
                        element.style.height = '100%';
                        element.style.objectFit = 'contain';
                        wrapperRef.current.appendChild(element);
                    }

                    const decoder = new WebCodecsVideoDecoder({
                        codec: ScrcpyVideoCodecId.H264,
                        renderer: renderer,
                    });
                    setIsVideoLoaded(true);

                    // Update video size and screen orientation in sizeChanged
                    decoder.sizeChanged(({width, height}) => {
                        // Update video size (for touch coordinate conversion and display)
                        setVideoSize({width, height});

                        // Update screen orientation state
                        const landscape = width > height;
                        setIsLandscape(landscape);
                    });

                    stream
                        .pipeTo(decoder.writable)
                        .catch(error => {
                            // Ignore common errors during component unmount
                            if (error.name !== 'AbortError' &&
                                !error.message.includes('locked') &&
                                !error.message.includes('closed')) {
                                console.error(`Video stream processing error:`, error);
                            }
                        });
                });

                if (scrcpy.clipboard) {
                    void scrcpy.clipboard.pipeTo(
                        new WritableStream<string>({
                            write(chunk) {
                                globalThis.navigator.clipboard.writeText(chunk);
                            },
                        }),
                    ).catch(err => console.error(`Clipboard error:`, err));
                }

                void scrcpy.output.pipeTo(
                    new WritableStream<string>({
                        write(chunk) {
                            console.log(`Output:`, chunk);
                        },
                    }),
                );

                cleanupRef.current = () => {
                    scrcpy.close();
                    adb.close();
                    transport.close();
                };

            } catch (e) {
                console.error(`Initialization failed:`, e);
                setError(e instanceof Error ? e.message : 'Failed to connect to device');
                setIsLoading(false);
            }
        };

        initializeDevice();

        return () => {
            // Clean up audio manager
            audioManagerRef.current?.cleanup();
            audioManagerRef.current = null;

            // Clean up scrcpy/adb/transport
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }

            // Clear controller and client references
            controllerRef.current = null;
            scrcpyClientRef.current = null;

            // Clear video container (using captured wrapper value)
            if (wrapper) {
                wrapper.innerHTML = '';
            }

            // Reset state
            setIsVideoLoaded(false);
            setIsLandscape(false);
            setIsMuted(true);
            isMutedRef.current = true;
            setAudioAvailable(true);
            setAudioError(false);
        };
    }, [serial]);


    // Mute toggle
    const toggleMute = () => {
        if (isMuted) {
            // Unmute: start audio player (user interaction, complies with browser policy)
            audioManagerRef.current?.start();
            setIsMuted(false);
            isMutedRef.current = false;
        } else {
            // Mute: stop audio player
            audioManagerRef.current?.stop();
            setIsMuted(true);
            isMutedRef.current = true;
        }
    };

    // Rotate screen
    const rotateScreen = () => {
        if (scrcpyClientRef.current?.controller) {
            scrcpyClientRef.current.controller.rotateDevice();
        }
    };

    /**
     * Get SVG placeholder size (swap width/height for mobile landscape)
     */
    const getVisualSize = () => {
        const size = videoSize || screenSize || {width: 0, height: 0};

        // Mobile landscape: swap dimensions to fit rotated video
        if (isMobile && isLandscape) {
            return {
                width: size.height,
                height: size.width
            };
        }

        return size;
    };

    /**
     * Get video container style (rotate 90° for mobile landscape)
     */
    const getVideoWrapperStyle = (): React.CSSProperties => {
        if (!isMobile || !isLandscape || !videoSize) {
            // Desktop or portrait: normal display
            return {
                position: 'absolute',
                inset: 0
            };
        }

        // Mobile landscape: rotate container 90°
        return {
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${videoSize.width}px`,
            height: `${videoSize.height}px`,
            maxWidth: '70vh',
            maxHeight: '100vw',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            transformOrigin: 'center center',
            transition: 'transform 0.3s ease'
        };
    };

    /**
     * Get touch rotation angle (returns 90 for mobile landscape)
     */
    const getTouchRotation = (): number => {
        return (isMobile && isLandscape) ? 90 : 0;
    };

    /**
     * Get touch screen size (always use original size, rotation handles coordinate conversion)
     */
    const getTouchScreenSize = () => {
        return videoSize || screenSize || {width: 0, height: 0};
    };


    return (
        <div className="h-full flex items-center justify-center p-2 md:p-6">
            <Card className="w-full h-full gap-3">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/')}
                        >
                            <ArrowLeft className="h-4 w-4"/>
                        </Button>
                        <div className="flex-1">
                            <CardTitle className="flex items-center gap-1">
                                {deviceInfo ? deviceInfo.market_name : serial}
                                {isLoading && <Spinner className="h-4 w-4 text-muted-foreground"/>}
                            </CardTitle>
                            <CardDescription>
                                {deviceInfo ? `${deviceInfo.model} (${deviceInfo.device})` : serial}
                            </CardDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={rotateScreen}
                            disabled={!isVideoLoaded}
                            title={`Rotate screen (current: ${isLandscape ? 'Landscape' : 'Portrait'})`}
                        >
                            <RectangleVertical
                                className="h-4 w-4 transition-transform duration-300"
                                style={{transform: isLandscape ? 'rotate(90deg)' : 'rotate(0deg)'}}
                            />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            disabled={!audioAvailable}
                            title={
                                !audioAvailable
                                    ? (audioError ? "Audio error" : "Audio unavailable")
                                    : (isMuted ? "Unmute" : "Mute")
                            }
                            className={audioError ? "text-destructive hover:text-destructive" : ""}
                        >
                            {isMuted ? <VolumeOff className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleKeyPress(AndroidKeyCode.Power)}
                            title="Power"
                        >
                            <Power className="h-4 w-4"/>
                        </Button>

                    </div>
                </CardHeader>
                <CardContent className="px-2 md:px-6">
                    {error ? (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 flex flex-col items-center gap-4">
                            <AlertCircle className="h-8 w-8 text-destructive"/>
                            <div className="text-center">
                                <p className="font-medium text-destructive mb-2">Connection Failed</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                            </div>
                            <Button onClick={() => window.location.reload()} variant="outline">
                                Retry
                            </Button>
                        </div>
                    ) : screenSize && (
                        <div className="flex items-center justify-center">


                            <div className="inline-flex flex-col gap-0 ">
                                {/* Screen display area */}
                                <div className="canvas-wrapper border-2 border-solid border-black rounded-t-sm overflow-hidden bg-white relative">
                                    {/* Keyboard control */}
                                    <KeyboardControl client={scrcpyClientRef.current} enabled={isVideoLoaded}/>

                                    <TouchControl
                                        client={scrcpyClientRef.current}
                                        screenWidth={getTouchScreenSize().width}
                                        screenHeight={getTouchScreenSize().height}
                                        rotation={getTouchRotation()}
                                    >
                                        {/* Base layer: SVG placeholder for sizing */}
                                        <svg
                                            width={getVisualSize().width}
                                            height={getVisualSize().height}
                                            style={{
                                                display: 'block',
                                                maxWidth: '100%',
                                                maxHeight: '70vh',
                                                width: 'auto',
                                                height: 'auto'
                                            }}
                                        />

                                        {/* Middle layer: video container (handles rotation) */}
                                        <div
                                            ref={wrapperRef}
                                            style={getVideoWrapperStyle()}
                                        />

                                        {/* Top layer: loading animation */}
                                        {!isVideoLoaded && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <Spinner className="h-8 w-8 text-black"/>
                                            </div>
                                        )}
                                    </TouchControl>
                                </div>

                                {/* Android-style navigation bar */}
                                <div className="flex items-center justify-around bg-black/90 border-2 border-t-0 border-black rounded-b-sm w-full">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="Back"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidHome)}
                                    >
                                        <ChevronLeft className="h-6 w-6"/>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="Home"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidHome)}
                                    >
                                        <Home className="h-5 w-5"/>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="Recent Apps"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidAppSwitch)}
                                    >
                                        <Square className="h-5 w-5"/>
                                    </Button>

                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}