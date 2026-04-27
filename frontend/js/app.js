/**
 * CodeNebula - Main Application
 * Event-driven real-time visualization
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GalaxyRenderer } from './galaxy.js';
import { WebSocketClient } from './ws-client.js';

class CodeNebulaApp {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.galaxyRenderer = null;
        this.wsClient = null;
        
        this.clock = new THREE.Clock();
        
        this.init();
    }

    async init() {
        console.log('CodeNebula initializing...');

        try {
            // 初始化 3D 场景
            this.initScene();

            // 初始化星系渲染器
            this.galaxyRenderer = new GalaxyRenderer(this.scene, this.camera);

            // 初始化 WebSocket 客户端
            this.wsClient = new WebSocketClient('ws://localhost:8000/ws');
            this.wsClient.on('connected', () => this.onConnected());
            this.wsClient.on('disconnected', () => this.onDisconnected());
            this.wsClient.on('event', (event) => this.onEvent(event));
            this.wsClient.connect();

            // 开始渲染循环
            this.animate();

            // 绑定控制器
            this.bindControls();

            console.log('CodeNebula ready');

        } catch (error) {
            console.error('CodeNebula Error:', error);
            this.showError('Error: ' + error.message + '<br><small>' + (error.stack || '').split('\n')[0] + '</small>');
        }
    }

    initScene() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;

        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050508);

        // 相机
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
        this.camera.position.set(0, 0, 300);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // 星空背景
        this.addStarfield();

        // 窗口调整
        window.addEventListener('resize', () => this.onResize());
    }

    addStarfield() {
        const geometry = new THREE.BufferGeometry();
        const count = 3000;
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const radius = 500 + Math.random() * 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.6
        });

        this.scene.add(new THREE.Points(geometry, material));
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        this.controls.update();
        this.galaxyRenderer?.animate(delta);
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    bindControls() {
        // 重置视图
        document.getElementById('btn-reset')?.addEventListener('click', () => {
            this.camera.position.set(0, 0, 300);
            this.controls.target.set(0, 0, 0);
        });

        // 全屏
        document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // 筛选
        document.getElementById('filter-py')?.addEventListener('change', (e) => {
            this.galaxyRenderer?.setFilter('py', e.target.checked);
        });

        document.getElementById('filter-js')?.addEventListener('change', (e) => {
            this.galaxyRenderer?.setFilter('js', e.target.checked);
        });

        document.getElementById('filter-connections')?.addEventListener('change', (e) => {
            this.galaxyRenderer?.setConnectionsVisible(e.target.checked);
        });
    }

    onConnected() {
        document.getElementById('ws-status').classList.add('connected');
        document.querySelector('#ws-status .status-text').textContent = 'Connected';
        document.getElementById('loading-overlay').classList.add('hidden');
        console.log('WebSocket connected');
    }

    onDisconnected() {
        document.getElementById('ws-status').classList.remove('connected');
        document.querySelector('#ws-status .status-text').textContent = 'Disconnected';
        console.log('WebSocket disconnected');
    }

    onEvent(event) {
        console.log('[App] onEvent received:', event);

        const eventLog = document.getElementById('event-log');
        const type = event.type;

        // 添加日志
        const logItem = document.createElement('div');
        logItem.className = `event-item ${type.toLowerCase()}`;
        logItem.innerHTML = `
            <span class="file-name">${event.star?.name || event.star_id || 'Unknown'}</span>
            <span class="event-type">${type}</span>
        `;
        eventLog.prepend(logItem);

        // 限制日志数量
        while (eventLog.children.length > 20) {
            eventLog.removeChild(eventLog.lastChild);
        }

        // 根据事件类型触发特效
        this.galaxyRenderer?.handleEvent(event);

        // 更新统计
        this.updateStats(event);
    }

    updateStats(event) {
        const stats = this.galaxyRenderer?.getStats() || {};
        
        document.getElementById('stat-files').textContent = stats.files || 0;
        document.getElementById('stat-functions').textContent = stats.functions || 0;
        document.getElementById('stat-classes').textContent = stats.classes || 0;
    }

    showError(message) {
        const loading = document.getElementById('loading-overlay');
        if (loading) {
            loading.innerHTML = `
                <div style="color: #ef4444; text-align: center;">
                    <p>${message}</p>
                    <p style="margin-top: 10px; font-size: 12px; color: #888;">
                        Make sure backend is running: python backend/main.py --path /your/project
                    </p>
                </div>
            `;
        }
    }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
    window.onerror = function(msg, url, line) {
        const errorDiv = document.getElementById('loading-overlay');
        if (errorDiv) {
            errorDiv.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;"><p>JS Error</p><small>' + msg + '</small><br><small>Line: ' + line + '</small></div>';
        }
        return true;
    };
    window.app = new CodeNebulaApp();
});

// 捕获模块加载错误
window.addEventListener('error', (e) => {
    console.error('Global Error:', e);
});
