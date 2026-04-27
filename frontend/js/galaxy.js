/**
 * CodeNebula - 星系渲染器
 * 简化的恒星/行星渲染 + 特效动画
 */

import * as THREE from 'three';

export class GalaxyRenderer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // 恒星和特效容器
        this.starGroup = new THREE.Group();
        this.effectGroup = new THREE.Group();
        this.scene.add(this.starGroup);
        this.scene.add(this.effectGroup);

        // 恒星数据
        this.stars = new Map();
        this.connections = [];

        // 统计
        this.stats = { files: 0, functions: 0, classes: 0 };

        // 筛选
        this.filters = {
            py: true,
            js: true,
            connections: false
        };

        // 动画状态
        this.animations = [];

        // 创建中轴线（恒星旋转的参照轴）
        this.createCentralAxis();
    }

    createCentralAxis() {
        console.log('[Galaxy] Creating central axis...');
        
        // 中轴线组
        this.axisGroup = new THREE.Group();
        this.scene.add(this.axisGroup);

        // 主轴线：从中心向上延伸的直线
        const axisLength = 150;
        const axisGeometry = new THREE.BufferGeometry();
        const axisPositions = new Float32Array([
            0, -axisLength, 0,  // 底部
            0, axisLength, 0   // 顶部
        ]);
        axisGeometry.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));

        // 发光轴线材质 - 增加亮度
        const axisMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: false,
            opacity: 1.0
        });

        const axisLine = new THREE.Line(axisGeometry, axisMaterial);
        this.axisGroup.add(axisLine);

        // 轴线外层发光管道
        const pipeGeometry = new THREE.CylinderGeometry(1.5, 1.5, axisLength * 2, 16);
        const pipeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial);
        this.axisGroup.add(pipeMesh);

        // 中心发光球体 - 更亮
        const coreGeometry = new THREE.SphereGeometry(5, 32, 32);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });
        const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
        coreMesh.position.y = 0;
        this.axisGroup.add(coreMesh);

        // 核心外层光晕（调暗）
        const coreGlowGeometry = new THREE.SphereGeometry(10, 32, 32);
        const coreGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.08,  // 调暗
            side: THREE.BackSide
        });
        const coreGlowMesh = new THREE.Mesh(coreGlowGeometry, coreGlowMaterial);
        coreMesh.add(coreGlowMesh);

        // 最外层大光晕（调暗）
        const outerGlowGeometry = new THREE.SphereGeometry(20, 32, 32);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.05,  // 调暗
            side: THREE.BackSide
        });
        const outerGlowMesh = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
        coreMesh.add(outerGlowMesh);

        // 水平旋转光环（调暗）
        const ringGeometry = new THREE.RingGeometry(15, 18, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.08,  // 调暗
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        this.axisGroup.add(ring);

        // 垂直旋转光环（调暗）
        const vRingGeometry = new THREE.RingGeometry(12, 14, 64);
        const vRingMaterial = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.06,  // 调暗
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

        // 清空现有
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

        // 筛选
        if (isPy && !this.filters.py) return;
        if (isJs && !this.filters.js) return;

        // 位置：银河系圆盘分布
        const maxRadius = 80;
        const diskThickness = 5;
        
        // 使用文件路径生成种子
        const seed = this.hashCode(starData.path || starData.name);
        
        // 使用 Mulberry32 伪随机数生成器（高质量、快速）
        const rng = this.mulberry32(seed);
        
        // 生成三个独立的随机数
        const r = rng();      // 0-1，用于半径
        const theta = rng();  // 0-1，用于角度
        const yFactor = rng(); // 0-1，用于Y轴高度
        
        // 半径：平方根分布让恒星更集中在中心
        const radius = Math.sqrt(r) * maxRadius;
        
        // 角度：均匀分布在 0-2π
        const angle = theta * Math.PI * 2;
        
        // 转换为直角坐标（xz平面）
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        
        // Y轴：使用反正切变换，让高度分布更像高斯
        const normalizedY = (yFactor - 0.5) * 2;
        const clampedY = Math.atan(normalizedY * 3) / (Math.PI / 2) * diskThickness;

        console.log('[Galaxy] Creating star:', starData.name, 'at', x, clampedY, z);

        // 颜色
        let color = 0xffffff;
        if (isPy) color = 0x00d4ff;       // 青色 - Python
        else if (isJs) color = 0xf7df1e;  // 黄色 - JS

        // 大小基于代码行数（增强版：使用更明显的权重差异）
        // 公式：基础 + sqrt(行数)*系数，让大文件更突出
        const lines = starData.lines || 10;
        // 小文件(10行)：~2.5
        // 中文件(50行)：~5.8
        // 大文件(100行)：~7.5
        // 超大文件(200行)：~9
        let size = 1.5 + Math.sqrt(lines) * 0.6;
        size = Math.min(Math.max(size, 1.5), 10); // 范围 1.5 - 10

        // 创建球体
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, clampedY, z);
        mesh.userData = starData;

        // 创建光晕（调暗）
        const glowGeometry = new THREE.SphereGeometry(size * 2, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.08,  // 调暗
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
