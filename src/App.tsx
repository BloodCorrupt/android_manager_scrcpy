import {useEffect, useState} from 'react'
import {BrowserRouter as Router, Routes, Route, useNavigate} from 'react-router-dom'
import {Smartphone, AlertCircle, ArrowUpRightIcon, Terminal, Folder, Plus, LogOut, Usb, Wifi, Database} from 'lucide-react'
import DeviceDetail from './scrcpy/DeviceDetail'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './components/ui/card'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './components/ui/table'
import {Skeleton} from './components/ui/skeleton'
import {Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle} from "./components/ui/empty";
import {Button} from "@/components/ui/button.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from './components/ui/dialog';
import {Input} from './components/ui/input';
import {Label} from './components/ui/label';
import type {DeviceBasicInfo} from './types/device.types';
import AuthGuard from './components/AuthGuard';

// Device state badge mapping
const getDeviceStateBadge = (state: string) => {
    const stateMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
        'device': {variant: 'default', label: 'Online'},
        'offline': {variant: 'destructive', label: 'Offline'},
        'unauthorized': {variant: 'outline', label: 'Unauthorized'},
    };
    return stateMap[state] || {variant: 'secondary', label: state};
};

// Connection type badge mapping
const getConnectionBadge = (type?: string) => {
    switch (type) {
        case 'usb':
            return {
                icon: <Usb className="h-3 w-3"/>,
                label: 'USB',
                className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
            };
        case 'tcp':
            return {
                icon: <Wifi className="h-3 w-3"/>,
                label: 'TCP',
                className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25'
            };
        case 'registered':
            return {
                icon: <Database className="h-3 w-3"/>,
                label: 'Registered',
                className: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25'
            };
        default:
            return {
                icon: <Wifi className="h-3 w-3"/>,
                label: 'Unknown',
                className: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/25'
            };
    }
};

// Device list component
function DeviceList() {
    const navigate = useNavigate();
    const [devices, setDevices] = useState<DeviceBasicInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [serialInput, setSerialInput] = useState('');

    const handleLogout = async () => {
        if ((window as any).__authLogout) {
            await (window as any).__authLogout();
        }
    };

    useEffect(() => {
        let socket: WebSocket | null = null;

        try {
            const isDev = import.meta.env.DEV;
            const apiPort = import.meta.env.VITE_SERVER_PORT || 8080;
            const wsHost = isDev ? `${window.location.hostname}:${apiPort}` : window.location.host;
            const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            
            socket = new WebSocket(`${wsProtocol}://${wsHost}/devices`);

            socket.addEventListener('open', () => {
                setIsLoading(false);
                setError(undefined);
            });

            socket.addEventListener('message', ({data}) => {
                try {
                    setDevices(JSON.parse(data));
                    setIsLoading(false);
                } catch (err) {
                    setError('Failed to parse device data: ' + err);
                }
            });

            socket.addEventListener('error', () => {
                setError('WebSocket connection failed');
                setIsLoading(false);
            });

            socket.addEventListener('close', () => {
                setError('WebSocket connection closed');
            });
        } catch (err) {
            setError('Unable to establish WebSocket connection: ' + err);
            setIsLoading(false);
        }

        return () => {
            socket?.close();
        };
    }, []);

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Device Manager</CardTitle>
                            <CardDescription>
                                ADB devices connected to the server (USB / TCP)
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Plus className="h-4 w-4 mr-2"/>
                                        Add Device
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Device</DialogTitle>
                                        <DialogDescription>
                                            Enter the device IP address and port (e.g. 192.168.1.100:5555)
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="serial">Device Address</Label>
                                            <Input
                                                id="serial"
                                                placeholder="192.168.1.100:5555"
                                                value={serialInput}
                                                onChange={(e) => setSerialInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && serialInput.trim()) {
                                                        navigate(`/device/${serialInput.trim()}`);
                                                        setDialogOpen(false);
                                                        setSerialInput('');
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setDialogOpen(false);
                                                setSerialInput('');
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                if (serialInput.trim()) {
                                                    navigate(`/device/${serialInput.trim()}`);
                                                    setDialogOpen(false);
                                                    setSerialInput('');
                                                }
                                            }}
                                            disabled={!serialInput.trim()}
                                        >
                                            Connect
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleLogout}
                                title="Logout"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                                <LogOut className="h-4 w-4"/>
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full"/>
                            <Skeleton className="h-16 w-full"/>
                            <Skeleton className="h-16 w-full"/>
                            <Skeleton className="h-16 w-full"/>
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive"/>
                            <p className="text-sm text-destructive font-medium">{error}</p>
                        </div>
                    ) : devices && devices.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Device Name</TableHead>
                                    <TableHead>Serial</TableHead>
                                    <TableHead className="text-center">Connection</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {devices.map((device) => {
                                    const connBadge = getConnectionBadge(device.connectionType);
                                    return (
                                        <TableRow key={device.serial + device.transportId?.toString()}>
                                            <TableCell className="font-medium">{device.model || 'Unknown Device'}</TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                                    {device.serial}
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center">
                                                    <Badge
                                                        variant="outline"
                                                        className={`gap-1 text-xs font-medium ${connBadge.className}`}
                                                    >
                                                        {connBadge.icon}
                                                        {connBadge.label}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-1">
                                                    <Badge className="size-2 rounded-full p-0" variant={getDeviceStateBadge(device.state).variant}/>
                                                    <span>{getDeviceStateBadge(device.state).label}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(`/device/${device.serial}`)}>
                                                        <Smartphone className="h-4 w-4"/>
                                                    </Button>
                                                    <Button variant="outline" size="icon" className="h-8 w-8">
                                                        <Terminal className="h-4 w-4"/>
                                                    </Button>
                                                    <Button variant="outline" size="icon" className="h-8 w-8">
                                                        <Folder className="h-4 w-4"/>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Smartphone className="h-6 w-6 text-muted-foreground"/>
                                </EmptyMedia>
                                <EmptyTitle>No Devices Found</EmptyTitle>
                                <EmptyDescription>Connect a device via USB or ensure it is connected to the ADB server</EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                                <div className="flex gap-2">
                                    <Button>Refresh</Button>
                                    <Button variant="outline">Setup Guide</Button>
                                </div>
                            </EmptyContent>
                            <Button
                                variant="link"
                                asChild
                                className="text-muted-foreground"
                                size="sm">
                                <a href="#">
                                    Learn More <ArrowUpRightIcon/>
                                </a>
                            </Button>
                        </Empty>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// Main App component
function App() {
    return (
        <AuthGuard>
            <Router>
                <Routes>
                    <Route path="/" element={<DeviceList/>}/>
                    <Route path="/device/:serial" element={<DeviceDetail/>}/>
                </Routes>
            </Router>
        </AuthGuard>
    )
}

export default App
