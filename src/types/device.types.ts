/**
 * 设备相关的类型定义
 * 前后端共用
 */

import {type AdbFeature, AdbServerClient} from "@yume-chan/adb";

/**
 * 设备注册数据接口
 */
export interface DeviceRegisterData {
    serial_no: string;
    android_id?: string;
    boot_id?: string;
    ble_mac?: string;
    model?: string;
    market_name?: string;
    version?: string;
    kernel_ver?: string;
    adb_enabled?: string;
    adb_port?: string;
    adb_status?: string;
    adb_pid?: string;
    iface?: string;
    src_ip?: string;
    iface_ip?: string;
}

/**
 * 完整的设备信息（扁平结构）
 */
export interface DeviceInfo {
    // 基本信息
    serial: string;
    serial_no: string;
    android_id: string;
    boot_id: string;
    ble_mac: string;

    // 设备型号
    model: string;
    market_name: string;
    manufacturer: string;
    brand: string;
    device: string;

    // 系统版本
    android_version: string;
    sdk_version: number;
    security_patch: string;
    kernel_version: string;

    // ADB 信息
    adb_enabled: boolean;
    adb_port: number;
    adb_status: string;
    adb_pid: number;

    // 网络信息
    network_interface: string;  // 主网络接口名称，如: wlan0
    network_ip: string;         // 主网络接口 IP，如: 192.168.23.184
    network_src_ip: string;     // 源 IP

    // 硬件信息
    cpu: string;
    cpu_cores: number;
    mem_total_kb: number;
    mem_available_kb: number;
    storage: string;

    // 电池信息
    battery_level: number;      // 电量百分比 0-100
    battery_status: number;     // 充电状态码
    battery_temperature: number; // 温度（十分之一摄氏度，如 250 = 25.0°C）

    // 屏幕信息
    screen_width: number;   // 屏幕宽度（像素）
    screen_height: number;  // 屏幕高度（像素）
    screen_density: number; // 屏幕密度 DPI
    screen_orientation: number; // 屏幕方向
}

/**
 * 设备简要信息（用于列表显示）
 */
export interface DeviceBasicInfo {
    serial: string;
    state: AdbServerClient.ConnectionState,
    model: string;
    product: string;
    device: string;
    transportId?: number;
    connectionType?: "usb" | "tcp" | "registered";
}

/**
 * 设备响应数据（包含设备信息和 ADB 元数据）
 */
export interface DeviceResponse extends DeviceBasicInfo {
    maxPayloadSize: number;
    features: readonly AdbFeature[];
    info: DeviceInfo;
}

