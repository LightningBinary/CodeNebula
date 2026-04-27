/**
 * CodeNebula - 连线渲染
 */

import * as THREE from 'three';

export class ConnectionRenderer {
    constructor(sceneManager, galaxyRenderer) {
        this.sceneManager = sceneManager;
        this.galaxyRenderer = galaxyRenderer;
        this.scene = sceneManager.scene;

        this.connections = new THREE.Group();
        this.connections.name = 'connections';
        this.scene.add(this.connections);

        this.connectionTypes = {
            call: { color: 0x00d4ff, opacity: 0.4, lineWidth: 1 },
            import: { color: 0xa855f7, opacity: 0.3, lineWidth: 2 },
            inheritance: { color: 0xfbbf24, opacity: 0.5, lineWidth: 1.5 }
        };

        this.showConnections = false;
        this.activeConnections = new Map();
        this.lineMaterials = {};
    }

    render(data) {
        this.clear();

        const stars = data.stars || [];
        const planets = data.planets || [];

        this.drawInheritanceLines(stars);
        this.drawImportLines(stars);
    }

    drawInheritanceLines(stars) {
        const config = this.connectionTypes.inheritance;

        stars.forEach(star => {
            const children = star.children || [];
            const classes = children.filter(c => c.type === 'class' && c.bases);

            classes.forEach(cls => {
                cls.bases.forEach(baseName => {
                    const baseClass = this.findClassByName(baseName, stars);
                    if (baseClass) {
                        this.createCurveConnection(cls.id, baseClass.id, config.color, config.opacity);
                    }
                });
            });
        });
    }

    drawImportLines(stars) {
        const config = this.connectionTypes.import;

        stars.forEach(star => {
            const imports = star.imports || [];

            imports.forEach(importName => {
                const targetStar = this.findStarByImport(importName, stars);
                if (targetStar && targetStar.id !== star.id) {
                    this.createCurveConnection(star.id, targetStar.id, config.color, config.opacity);
                }
            });
        });
    }

    createCurveConnection(fromId, toId, color, opacity) {
        const fromObj = this.galaxyRenderer.stars.get(fromId) ||
                        this.galaxyRenderer.planets.get(fromId);
        const toObj = this.galaxyRenderer.stars.get(toId) ||
                      this.galaxyRenderer.planets.get(toId);

        if (!fromObj || !toObj) return;

        const start = fromObj.position.clone();
        const end = toObj.position.clone();
        const mid = start.clone().add(end).multiplyScalar(0.5);

        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );
        mid.add(offset);

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity
        });

        const line = new THREE.Line(geometry, material);
        line.visible = this.showConnections;

        this.connections.add(line);
        this.activeConnections.set(`${fromId}_${toId}`, line);
    }

    setVisible(visible) {
        this.showConnections = visible;
        this.connections.children.forEach(child => {
            child.visible = visible;
        });
    }

    setOpacity(opacity) {
        this.activeConnections.forEach(line => {
            line.material.opacity = opacity / 100;
        });
    }

    findClassByName(name, stars) {
        for (const star of stars) {
            const children = star.children || [];
            const found = children.find(c => c.name === name);
            if (found) return found;
        }
        return null;
    }

    findStarByImport(importName, stars) {
        const baseName = importName.split('.')[0].split('/').pop();
        return stars.find(star => {
            const starName = star.name.replace(/\.[^/.]+$/, '');
            return starName === baseName;
        });
    }

    clear() {
        while (this.connections.children.length > 0) {
            const child = this.connections.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.connections.remove(child);
        }
        this.activeConnections.clear();
    }

    dispose() {
        this.clear();
        this.scene.remove(this.connections);
    }
}
