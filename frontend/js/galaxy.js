/**
 * CodeNebula - Galaxy Renderer
 * Simplified star/planet rendering + special effect animations
 */

import * as THREE from 'three';

export class GalaxyRenderer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Star and effect containers
        this.starGroup = new THREE.Group();
        this.effectGroup = new THREE.Group();
        this.scene.add(this.starGroup);
        this.scene.add(this.effectGroup);

        // Star data
        this.stars = new Map();
        this.connections = [];

        // Stats
        this.stats = { files: 0, functions: 0, classes: 0 };

        // Filters
        this.filters = {
            py: true,
            js: true,
            connections: false
        };

        // Animation state
        this.animations = [];

        // Create central axis (reference axis for star rotation)
        this.createCentralAxis();
    }

    createCentralAxis() {
        console.log('[Galaxy] Creating central axis...');
        
        // Central axis group
        this.axisGroup = new THREE.Group();
        this.scene.add(this.axisGroup);

        // Main axis: line extending from center
        const axisLength = 150;
        const axisGeometry = new THREE.BufferGeometry();
        const axisPositions = new Float32Array([
            0, -axisLength, 0,  // Bottom
            0, axisLength, 0   // Top
        ]);
        axisGeometry.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));

        // Glowing axis material
        const axisMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: false,
            opacity: 1.0
        });

        const axisLine = new THREE.Line(axisGeometry, axisMaterial);
        this.axisGroup.add(axisLine);

        // Axis outer glow pipe
        const pipeGeometry = new THREE.CylinderGeometry(1.5, 1.5, axisLength * 2, 16);
        const pipeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial);
        this.axisGroup.add(pipeMesh);

        // Center glowing sphere
        const coreGeometry = new THREE.SphereGeometry(5, 32, 32);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });
        const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
        coreMesh.position.y = 0;
        this.axisGroup.add(coreMesh);

        // Core outer glow (dimmed)
        const coreGlowGeometry = new THREE.SphereGeometry(10, 32, 32);
        const coreGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.08,  // Dimmed
            side: THREE.BackSide
        });
        const coreGlowMesh = new THREE.Mesh(coreGlowGeometry, coreGlowMaterial);
        coreMesh.add(coreGlowMesh);

        // Outermost glow (dimmed)
        const outerGlowGeometry = new THREE.SphereGeometry(20, 32, 32);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.05,  // Dimmed
            side: THREE.BackSide
        });
        const outerGlowMesh = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
        coreMesh.add(outerGlowMesh);

        // Horizontal rotating ring (dimmed)
        const ringGeometry = new THREE.RingGeometry(15, 18, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.08,  // Dimmed
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        this.axisGroup.add(ring);

        // Vertical rotating ring (dimmed)
        const vRingGeometry = new THREE.RingGeometry(12, 14, 64);
        const vRingMaterial = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.06,  // Dimmed
            side: THREE.DoubleSide
        });
        const vRing = new THREE.Mesh(vRingGeometry, vRingMaterial);
        this.axisGroup.add(vRing);

        console.log('[Galaxy] Central axis created, axisGroup children:', this.axisGroup.children.length);
    }

    handleEvent(event) {
        const type = event.type;
        const star = event.star;

        console.log('[Galaxy] handleEvent:', type, event);

        switch (type) {
            case 'INIT':
                this.loadStars(event.stars || []);
                break;

            case 'MODIFIED':
                this.updateStar(star);
                this.playPulseEffect(star);
                break;

            case 'CREATED':
                this.addStar(star);
                this.playExplosionEffect(star);
                break;

            case 'DELETED':
                this.removeStar(event.star_id);
                break;
        }
    }

    loadStars(starsData) {
        console.log('[Galaxy] loadStars called with', starsData?.length || 0, 'stars');

        // Clear existing
        this.starGroup.clear();
        this.stars.clear();

        if (!starsData || starsData.length === 0) {
            console.log('[Galaxy] No stars data to load!');
            return;
        }

        let totalFunctions = 0;
        let totalClasses = 0;

        starsData.forEach(starData => {
            this.createStar(starData);
            totalFunctions += (starData.functions?.length || 0);
            totalClasses += (starData.classes?.length || 0);
        });

        this.stats.files = starsData.length;
        this.stats.functions = totalFunctions;
        this.stats.classes = totalClasses;

        console.log('[Galaxy] Created', this.stars.size, 'star meshes');
    }

    createStar(starData) {
        const ext = starData.ext || '.py';
        const isPy = ext === '.py';
        const isJs = ['.js', '.ts', '.jsx', '.tsx'].includes(ext);

        // Filters
        if (isPy && !this.filters.py) return;
        if (isJs && !this.filters.js) return;

        // Position: galaxy disk distribution
        const maxRadius = 80;
        const diskThickness = 5;
        
        // Generate seed from file path
        const seed = this.hashCode(starData.path || starData.name);
        
        // Use Mulberry32 PRNG (high quality, fast)
        const rng = this.mulberry32(seed);
        
        // Generate three independent random numbers
        const r = rng();      // 0-1, for radius
        const theta = rng();  // 0-1, for angle
        const yFactor = rng(); // 0-1, for Y-axis height
        
        // Radius: square root distribution clusters stars toward center
        const radius = Math.sqrt(r) * maxRadius;
        
        // Angle: uniform distribution 0-2π
        const angle = theta * Math.PI * 2;
        
        // Convert to Cartesian coordinates (xz plane)
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        
        // Y-axis: use arctan transform for Gaussian-like height distribution
        const normalizedY = (yFactor - 0.5) * 2;
        const clampedY = Math.atan(normalizedY * 3) / (Math.PI / 2) * diskThickness;

        console.log('[Galaxy] Creating star:', starData.name, 'at', x, clampedY, z);

        // Color
        let color = 0xffffff;
        if (isPy) color = 0x00d4ff;       // Cyan - Python
        else if (isJs) color = 0xf7df1e;  // Yellow - JS

        // Size based on code lines (enhanced: more obvious weight differences)
        const lines = starData.lines || 10;
        // Small file (10 lines): ~2.5
        // Medium file (50 lines): ~5.8
        // Large file (100 lines): ~7.5
        // Extra large file (200 lines): ~9
        let size = 1.5 + Math.sqrt(lines) * 0.6;
        size = Math.min(Math.max(size, 1.5), 10); // Range 1.5 - 10

        // Create sphere
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, clampedY, z);
        mesh.userData = starData;

        // Create glow (dimmed)
        const glowGeometry = new THREE.SphereGeometry(size * 2, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.08,  // Dimmed
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        mesh.add(glow);

        // 创建外部引用圆环
        this.createImportRings(mesh, starData, size, color);

        this.starGroup.add(mesh);
        this.stars.set(starData.id, mesh);
    }

    createImportRings(mesh, starData, baseSize, starColor) {
        const externalImports = starData.external_imports || [];
        const ringCount = Math.min(externalImports.length, 5); // 最多5层圆环

        if (ringCount === 0) return;

        // 圆环颜色配置
        const ringColors = [
            0xff6b6b,  // 红色 - npm 第三方库
            0xffd93d,  // 黄色 - 框架
            0x6bcb77,  // 绿色 - 工具库
            0x4d96ff,  // 蓝色 - 内置/核心
            0x9b59b6   // 紫色 - 其他
        ];

        for (let i = 0; i < ringCount; i++) {
            const ringRadius = baseSize * 3 + (i + 1) * baseSize * 1.2;
            const ringTube = Math.max(0.15, baseSize * 0.2 - i * 0.02);

            // 使用 TorusGeometry 创建圆环
            const ringGeometry = new THREE.TorusGeometry(ringRadius, ringTube, 16, 64);
            const ringColor = ringColors[i % ringColors.length];
            
            // 使用普通混合，与orbit rings一样暗
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: ringColor,
                transparent: true,
                opacity: 0.12 - i * 0.02  // 和orbit rings一样暗：0.12, 0.10, 0.08...
            });

            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            
            // 与 Orbit Ring 相同的倾斜角度（基于文件名 hash 生成固定倾角）
            let hash = 0;
            const name = starData.name || '';
            for (let i = 0; i < name.length; i++) {
                hash = ((hash << 5) - hash) + name.charCodeAt(i);
                hash |= 0;
            }
            const hashNorm = Math.abs(hash) / 0x7FFFFFFF;
            const orbitTiltX = (hashNorm * 0.5 - 0.25) * Math.PI;
            const orbitTiltZ = ((hash >> 8) % 100 / 100 - 0.5) * Math.PI * 0.7;
            
            // 设置与 Orbit Ring 相同的倾斜，不旋转（保持静止）
            ring.rotation.x = orbitTiltX;
            ring.rotation.z = orbitTiltZ;
            // Y 保持 0，确保与 Orbit Ring 在同一平面

            // 标记为 Import Ring（静态，不旋转）
            ring.userData = {
                isImportRing: true,
                ringIndex: i,
                importName: externalImports[i]
            };

            mesh.add(ring);
        }

        // 存储引用数量用于统计
        mesh.userData.externalImportCount = ringCount;
    }

    updateStar(starData) {
        let mesh = this.stars.get(starData.id);

        if (!mesh) {
            this.createStar(starData);
            mesh = this.stars.get(starData.id);
            return;
        }

        // 检查 imports 是否变化（需要重新创建圆环）
        const oldImportCount = mesh.userData.externalImportCount || 0;
        const newImportCount = (starData.external_imports || []).length;

        if (oldImportCount !== newImportCount) {
            // 移除旧的 Import Rings（保留恒星本体和光晕）
            const toRemove = [];
            mesh.children.forEach(child => {
                if (child.userData && child.userData.isImportRing) {
                    toRemove.push(child);
                }
            });
            toRemove.forEach(child => mesh.remove(child));

            // 重新创建圆环
            const size = mesh.geometry.parameters.radius;
            this.createImportRings(mesh, starData, size, mesh.material.color);
        }

        mesh.userData = starData;

        // 闪烁效果
        const originalScale = mesh.scale.x;
        mesh.scale.setScalar(originalScale * 1.5);

        // 动画回调
        this.animations.push({
            mesh,
            property: 'scale',
            start: originalScale * 1.5,
            end: originalScale,
            duration: 0.3,
            elapsed: 0
        });
    }

    addStar(starData) {
        this.createStar(starData);
        this.stats.files++;
    }

    removeStar(starId) {
        const mesh = this.stars.get(starId);
        if (mesh) {
            this.starGroup.remove(mesh);
            this.stars.delete(starId);
            this.stats.files--;
        }
    }

    playPulseEffect(starData) {
        const mesh = this.stars.get(starData.id);
        if (!mesh) return;

        // 脉动动画
        const baseScale = mesh.scale.x;
        this.animations.push({
            mesh,
            property: 'scale',
            start: baseScale * 1.3,
            end: baseScale,
            duration: 0.5,
            elapsed: 0,
            easing: (t) => Math.sin(t * Math.PI)
        });

        // 添加特效
        this.addPulseRing(mesh.position.clone());
    }

    playExplosionEffect(starData) {
        const mesh = this.stars.get(starData.id);
        if (!mesh) return;

        // 爆发动画：先放大后缩小
        this.animations.push({
            mesh,
            property: 'scale',
            start: 0.1,
            end: mesh.scale.x,
            duration: 0.4,
            elapsed: 0,
            easing: (t) => 1 - Math.pow(1 - t, 3)
        });

        // 添加爆发粒子
        this.addExplosionParticles(mesh.position.clone());
    }

    addPulseRing(position) {
        const geometry = new THREE.RingGeometry(1, 2, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(position);
        ring.lookAt(this.camera.position);

        this.effectGroup.add(ring);

        this.animations.push({
            mesh: ring,
            property: 'scale',
            start: 1,
            end: 10,
            duration: 0.5,
            elapsed: 0,
            onComplete: () => this.effectGroup.remove(ring)
        });

        this.animations.push({
            mesh: ring,
            property: 'opacity',
            start: 0.8,
            end: 0,
            duration: 0.5,
            elapsed: 0
        });
    }

    addExplosionParticles(position) {
        const count = 20;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xfbbf24,
            size: 3,
            transparent: true,
            opacity: 1
        });

        const particles = new THREE.Points(geometry, material);
        this.effectGroup.add(particles);

        // 粒子飞散动画
        const velocities = [];
        for (let i = 0; i < count; i++) {
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            ));
        }

        this.animations.push({
            particles,
            velocities,
            property: 'explode',
            duration: 0.8,
            elapsed: 0,
            onComplete: () => this.effectGroup.remove(particles)
        });
    }

    animate(delta) {
        // 中轴线旋转动画
        if (this.axisGroup) {
            this.axisGroup.rotation.y += delta * 0.05;
        }

        // 更新动画
        this.animations = this.animations.filter(anim => {
            anim.elapsed += delta;

            if (anim.elapsed >= anim.duration) {
                if (anim.onComplete) anim.onComplete();
                return false;
            }

            const progress = anim.elapsed / anim.duration;
            const easedProgress = anim.easing ? anim.easing(progress) : progress;
            const value = anim.start + (anim.end - anim.start) * easedProgress;

            if (anim.particles) {
                // 粒子爆炸
                const positions = anim.particles.geometry.attributes.position.array;
                for (let i = 0; i < anim.velocities.length; i++) {
                    positions[i * 3] += anim.velocities[i].x * delta * 30;
                    positions[i * 3 + 1] += anim.velocities[i].y * delta * 30;
                    positions[i * 3 + 2] += anim.velocities[i].z * delta * 30;
                }
                anim.particles.geometry.attributes.position.needsUpdate = true;
                anim.particles.material.opacity = 1 - progress;
            } else if (anim.property === 'opacity') {
                anim.mesh.material.opacity = value;
            } else if (anim.property === 'scale') {
                anim.mesh.scale.setScalar(value);
            }

            return true;
        });

        // 恒星自转
        this.stars.forEach(star => {
            star.rotation.y += delta * 0.2;

            // Import Ring 保持静止，不跟随恒星旋转
            // 其他圆环（如有）可以通过 rotationSpeed 标记来旋转
        });
    }

    setFilter(type, enabled) {
        this.filters[type] = enabled;

        // 重新显示/隐藏
        this.stars.forEach((mesh, id) => {
            const starData = mesh.userData;
            const ext = starData.ext || '.py';
            const isPy = ext === '.py';
            const isJs = ['.js', '.ts', '.jsx', '.tsx'].includes(ext);

            let visible = true;
            if (isPy && !this.filters.py) visible = false;
            if (isJs && !this.filters.js) visible = false;

            mesh.visible = visible;
        });
    }

    setConnectionsVisible(visible) {
        this.filters.connections = visible;
        // TODO: 实现连线
    }

    getStats() {
        return this.stats;
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // 从字符串生成伪随机数（不同 offset 产生不同的随机序列）
    simpleHash(str, offset) {
        let hash = offset;
        for (let i = 0; i < str.length; i++) {
            // 使用多个不同的质数混合
            hash = ((hash * 31) + (hash * 17) + str.charCodeAt(i) * 37) | 0;
        }
        return Math.abs(hash);
    }

    // Mulberry32 伪随机数生成器
    // 使用种子生成，返回一个函数，每次调用返回一个 0-1 的随机数
    mulberry32(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
}
