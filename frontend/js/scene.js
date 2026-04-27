/**
 * CodeNebula - Three.js 场景管理
 * 初始化3D场景、相机、灯光、控制器
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null;

        this.isInitialized = false;
        this.animationId = null;
        this.clock = new THREE.Clock();

        this.init();
    }

    init() {
        if (this.isInitialized) return;

        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050508);

        // 添加星空背景
        this.addStarfield();

        // 创建相机
        const aspect = this.width / this.height;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
        this.camera.position.set(0, 0, 100);

        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.toneMappingExposure = 1.5;
        this.container.appendChild(this.renderer.domElement);

        // 轨道控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 500;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 1.2;

        // 灯光设置
        this.setupLighting();

        // 后处理效果
        this.setupPostProcessing();

        // 响应窗口大小变化
        window.addEventListener('resize', () => this.onResize());

        // 开始渲染循环
        this.isInitialized = true;
        this.animate();
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const mainLight = new THREE.PointLight(0x00d4ff, 1, 200);
        mainLight.position.set(50, 50, 50);
        this.scene.add(mainLight);

        const auxLight = new THREE.PointLight(0xa855f7, 0.5, 150);
        auxLight.position.set(-30, -20, 40);
        this.scene.add(auxLight);
    }

    setupPostProcessing() {
        const renderScene = new RenderPass(this.scene, this.camera);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            0.8,  // 降低Bloom强度，减少模糊
            0.4,
            0.85
        );

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);
    }

    addStarfield() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 5000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            const radius = 500 + Math.random() * 1500;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);

            const brightness = 0.5 + Math.random() * 0.5;
            colors[i3] = brightness;
            colors[i3 + 1] = brightness;
            colors[i3 + 2] = brightness + Math.random() * 0.2;
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starMaterial = new THREE.PointsMaterial({
            size: 2,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        if (this.controls) {
            this.controls.update();
        }

        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        this.updateFPS();
    }

    updateFPS() {
        if (!this.fpsUpdateTime) this.fpsUpdateTime = 0;
        if (!this.frameCount) this.frameCount = 0;

        this.frameCount++;
        const now = performance.now();

        if (now - this.fpsUpdateTime >= 1000) {
            const fps = Math.round(this.frameCount * 1000 / (now - this.fpsUpdateTime));
            const fpsElement = document.getElementById('fps-counter');
            if (fpsElement) {
                fpsElement.textContent = `FPS: ${fps}`;
            }
            this.frameCount = 0;
            this.fpsUpdateTime = now;
        }
    }

    onResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);

        if (this.composer) {
            this.composer.setSize(this.width, this.height);
        }
    }

    addObject(object) {
        if (this.scene) {
            this.scene.add(object);
        }
    }

    removeObject(object) {
        if (this.scene) {
            this.scene.remove(object);
        }
    }

    getCamera() {
        return this.camera;
    }

    getControls() {
        return this.controls;
    }

    focusOn(position, distance = 50) {
        const start = this.camera.position.clone();
        const end = position.clone().add(
            new THREE.Vector3(distance, distance * 0.5, distance)
        );

        let t = 0;
        const duration = 60;

        const animate = () => {
            t++;
            const alpha = t / duration;
            const eased = 1 - Math.pow(1 - alpha, 3);

            this.camera.position.lerpVectors(start, end, eased);
            this.controls.target.lerp(position, eased);

            if (t < duration) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    resetView() {
        this.camera.position.set(0, 0, 100);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
