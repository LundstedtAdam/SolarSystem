import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import TWEEN from 'https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';

const TEXTURES = {
    sun: 'texture/sun.jpg',
    mercury: 'texture/2k_mercury.jpg',
    venus: 'texture/venus.jpg',
    earth: 'texture/earth.jpg',
    moon: 'texture/earth_moon.jpg',
    mars: 'texture/mars.jpg',
    phobos: 'texture/phobos.jpg',
    deimos: 'texture/deimos.jpg',
    jupiter: 'texture/jupiter.jpg',
    io: 'texture/io.jpg',
    europa: 'texture/europa.jpg',
    ganymede: 'texture/Ganymede.jpg',
    callisto: 'texture/Callisto.jpg',
    saturn: 'texture/saturn.jpg',
    saturnRing: 'texture/saturn_ring.png',
    titan: 'texture/titan.jpg',
    uranus: 'texture/uranus.jpg',
    miranda: 'texture/miranda.jpg',
    neptune: 'texture/neptune.jpg',
    triton: 'texture/triton.jpg',
    stars: 'texture/stars.jpg'
};

class SolarSystem {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 1, 20000); // Increased far plane
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.controls = null;
        this.planets = [];
        this.moons = [];
        this.orbits = [];
        this.selectedPlanet = null;
        this.speedMultiplier = 0.1;
        this.showOrbits = true;
        this.timeOffset = 0;
        this.textureCache = new Map();
        this.focusedObject = null;
        this.tweeningFocus = false; // Add this line

        // Initialize UI states
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.style.display = 'none';
        }
    }


    async init() {
        try {
            this.setupRenderer();
            this.setupCamera();
            this.createStarBackground();
            await this.createSun();
            await this.createPlanets();
            this.setupLighting();
            this.setupControls();
            this.setupEventListeners();
            this.hideLoadingScreen();
            this.animate();
        } catch (error) {
            console.error('Initieringsfel:', error);
            document.getElementById('loading').textContent = 'Ett fel uppstod vid laddning av solsystemet.';
        }
    }

    hideLoadingScreen() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('ui').style.display = 'block';
        document.getElementById('infoPanel').style.display = 'none';
    }

    setupRenderer() {
        const canvas = document.getElementById('solarSystemCanvas');
        this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    setupCamera() {
        this.camera.position.set(0, 200, 500);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
    }

    async createStarBackground() {
        const texture = await this.loadTexture(TEXTURES.stars, 0x000000);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        const geometry = new THREE.SphereGeometry(15000, 64, 64); // Increased size and segments
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            fog: false
        });
        
        const starBackground = new THREE.Mesh(geometry, material);
        this.scene.add(starBackground);
    }

    async loadTexture(url, fallbackColor) {
        if (this.textureCache.has(url)) return this.textureCache.get(url);
        try {
            const texture = await new THREE.TextureLoader().loadAsync(url);
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            texture.minFilter = THREE.LinearMipMapLinearFilter;
            this.textureCache.set(url, texture);
            return texture;
        } catch (error) {
            return new THREE.Color(fallbackColor);
        }
    }

    async createSun() {
        const texture = await this.loadTexture(TEXTURES.sun, 0xffff00);
        const geometry = new THREE.SphereGeometry(20, 64, 64);
        const material = new THREE.MeshBasicMaterial(texture.isColor ? { color: texture } : { map: texture });
        const sun = new THREE.Mesh(geometry, material);
        sun.name = "Sun";
        const sunLight = new THREE.PointLight(0xffffff, 2, 2000);
        sun.add(sunLight);
        this.scene.add(sun);
    }

    async createPlanets() {
        const planetsData = [
            {
                name: 'Merkurius',
                texture: TEXTURES.mercury,
                size: 3.8,
                distance: 60,
                speed: 1.6,
                color: 0x888888,
                moons: []
            },
            {
                name: 'Venus',
                texture: TEXTURES.venus,
                size: 9.5,
                distance: 90,
                speed: 1.2,
                color: 0xE8E1D1,
                moons: []
            },
            {
                name: 'Jorden',
                texture: TEXTURES.earth,
                size: 10,
                distance: 130,
                speed: 1.0,
                color: 0x3A5FCD,
                moons: [
                    { name: 'Månen', texture: TEXTURES.moon, size: 2.7, distance: 20, speed: 0.8 }
                ]
            },
            {
                name: 'Mars',
                texture: TEXTURES.mars,
                size: 5.3,
                distance: 170,
                speed: 0.8,
                color: 0x993D07,
                moons: [
                    { name: 'Phobos', texture: TEXTURES.phobos, size: 1.1, distance: 9, speed: 1.4 },
                    { name: 'Deimos', texture: TEXTURES.deimos, size: 0.6, distance: 15, speed: 1.2 }
                ]
            },
            {
                name: 'Jupiter',
                texture: TEXTURES.jupiter,
                size: 28,
                distance: 230,
                speed: 0.4,
                color: 0xB07F35,
                moons: [
                    { name: 'Io', texture: TEXTURES.io, size: 3.6, distance: 42, speed: 1.8 },
                    { name: 'Europa', texture: TEXTURES.europa, size: 3.1, distance: 67, speed: 1.5 },
                    { name: 'Ganymede', texture: TEXTURES.ganymede, size: 5.2, distance: 107, speed: 1.1 },
                    { name: 'Callisto', texture: TEXTURES.callisto, size: 4.8, distance: 188, speed: 0.9 }
                ]
            },
            {
                name: 'Saturnus',
                texture: TEXTURES.saturn,
                size: 24,
                distance: 300,
                speed: 0.3,
                color: 0xF4E395,
                moons: [
                    { name: 'Titan', texture: TEXTURES.titan, size: 5.8, distance: 122, speed: 1.0 }
                ],
                hasRing: true 
            },
            {
                name: 'Uranus',
                texture: TEXTURES.uranus,
                size: 10,
                distance: 350,
                speed: 0.2,
                color: 0x87CEEB,
                moons: [
                    { name: 'Miranda', texture: TEXTURES.miranda, size: 2.4, distance: 50, speed: 1.3 }
                ]
            },
            {
                name: 'Neptunus',
                texture: TEXTURES.neptune,
                size: 9.5,
                distance: 400,
                speed: 0.15,
                color: 0x4169E1,
                moons: [
                    { name: 'Triton', texture: TEXTURES.triton, size: 4.2, distance: 35, speed: 1.1 }
                ]
            }
        ];

        for (const data of planetsData) {
            const planet = await this.createPlanet(data);
            if (data.hasRing) {
                this.createSaturnRing(planet);
            }
            for (const moonData of data.moons) {
                await this.createMoon(planet, moonData);
            }
        }
    }

    async createPlanet(data) {
        const texture = await this.loadTexture(data.texture, data.color);
        const geometry = new THREE.SphereGeometry(data.size, 64, 64);
        const material = new THREE.MeshPhongMaterial(texture.isColor ? 
            { color: texture } : 
            { map: texture, specular: 0x222222, shininess: 10 }
        );
        const planet = new THREE.Mesh(geometry, material);
        planet.userData = { ...data, orbitalAngle: Math.random() * Math.PI * 2 };
        this.scene.add(planet);
        this.planets.push(planet);
        this.createOrbit(planet, data.distance);
        return planet;
    }

    async createMoon(parent, data) {
        const texture = await this.loadTexture(data.texture, 0x888888);
        const geometry = new THREE.SphereGeometry(data.size, 32, 32);
        const material = new THREE.MeshPhongMaterial(texture.isColor ? 
            { color: texture } : 
            { map: texture }
        );
        const moon = new THREE.Mesh(geometry, material);
        moon.userData = { ...data, parent: parent, orbitalAngle: Math.random() * Math.PI * 2 };
        this.scene.add(moon);
        this.moons.push(moon);
        return moon;
    }

    createOrbit(planet, distance) {
        const eccentricity = 0.1 * Math.random(); // Slumpmässig excentricitet
        const inclination = Math.random() * 0.1; // Slumpmässig lutning (i radianer)
        const points = [];
        const segments = 100;

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const r = distance * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(theta));
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = r * Math.sin(theta) * Math.sin(inclination);
            points.push(new THREE.Vector3(x, y, z));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.3 });
        const orbit = new THREE.Line(geometry, material);
        this.scene.add(orbit);
        this.orbits.push(orbit);

        // Spara banan och dess parametrar i planetens userData
        planet.userData.orbit = {
            eccentricity: eccentricity,
            inclination: inclination,
            semiMajorAxis: distance
        };
    }


    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 2000;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        this.renderer.domElement.addEventListener('click', (e) => this.onPlanetClick(e));
        document.getElementById('speed').addEventListener('input', (e) => this.updateSpeed(e));
        document.getElementById('toggleOrbits').addEventListener('click', () => this.toggleOrbits());
        document.getElementById('resetCamera').addEventListener('click', () => this.resetCamera());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onPlanetClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects([...this.planets, ...this.moons]);
        if (intersects.length > 0) this.handleSelection(intersects[0].object);
    }

    handleSelection(obj) {
        this.selectedPlanet = obj;
        this.showInfoPanel(obj);
        this.focusOnPlanet(obj);
    }

    showInfoPanel(obj) {
        const infoPanel = document.getElementById('infoPanel');
        infoPanel.innerHTML = `
        <button class="close-btn">×</button>
        <div class="info-content">
            <div class="avatar-container">
                <img src="assets/astro.webp" alt="Friendly robot guide" class="robot-avatar">
            </div>
            <div class="info-text">
                <h2>${obj.userData.name}</h2>
                <p>Diameter: ${(obj.userData.size * 1274).toLocaleString()} km</p>
                <p>Avstånd från solen: ${(obj.userData.distance * 15).toLocaleString()} miljoner km</p>
                <p>Omloppshastighet: ${obj.userData.speed}x</p>
            </div>
        </div>
    `;
        const closeBtn = infoPanel.querySelector(".close-btn");
        closeBtn.addEventListener('click', () => {
            infoPanel.style.display = 'none';
            this.resetCamera(); // Changed from resetCamera() to this.resetCamera()
        });
        infoPanel.style.display = 'block';
    }

    focusOnPlanet(planet) {
        this.focusedObject = planet;
        this.tweeningFocus = true; // Flag to enable tween mode
    
        // Use the camera's current direction to calculate a natural offset
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
    
        // Adjust distance based on planet size (with a fallback minimum distance)
        const sizeFactor = planet.userData.size > 5 ? 3 : 5;
        const distance = Math.max(planet.userData.size * sizeFactor, 20);
    
        // Compute target position: zoom in toward the planet along the opposite camera view direction
        const targetPosition = planet.position.clone().sub(direction.multiplyScalar(distance));
    
        // Smooth camera tween for zoom-in effect
        new TWEEN.Tween(this.camera.position)
            .to(targetPosition, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onComplete(() => {
                this.tweeningFocus = false;
                // Store the offset between the camera and the focused object once zoomed in
                this.focusOffset = this.camera.position.clone().sub(planet.position);
            })
            .start();
    
        // Tween the controls' target to the planet's position
        new TWEEN.Tween(this.controls.target)
            .to(planet.position, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .start();
    }
    

    updateSpeed(event) {
        this.speedMultiplier = parseFloat(event.target.value);
        document.getElementById('speedValue').textContent = `${this.speedMultiplier}x`;
    }

    toggleOrbits() {
        this.showOrbits = !this.showOrbits;
        this.orbits.forEach(orbit => orbit.visible = this.showOrbits);
    }

    resetCamera() {
        this.focusedObject = null;  // Add this line
        const defaultPosition = new THREE.Vector3(0, 200, 500);
        const defaultTarget = new THREE.Vector3(0, 0, 0);
        
        new TWEEN.Tween(this.camera.position)
            .to(defaultPosition, 1000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
            
        new TWEEN.Tween(this.controls.target)
            .to(defaultTarget, 1000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
    }

    async createSaturnRing(saturn) {
        const innerRadius = saturn.userData.size * 1.2;
        const outerRadius = saturn.userData.size * 2;
        const thetaSegments = 64;

        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, thetaSegments);

        // Ladda ringtexturen
        const texture = await this.loadTexture(TEXTURES.saturnRing, 0xf0e4b5);
        texture.flipY = false;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });

        // Justera UV-mappningen för att texturen ska passa ringen korrekt
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v3.fromBufferAttribute(pos, i);
            const u = (v3.length() - innerRadius) / (outerRadius - innerRadius);
            const v = Math.atan2(v3.y, v3.x) / (2 * Math.PI) + 0.5;
            uv.setXY(i, u, v);
        }

        const ring = new THREE.Mesh(geometry, material);

        // Skapa en container för ringen
        const ringContainer = new THREE.Object3D();
        ringContainer.add(ring);

        // Rotera containern istället för ringen direkt
        ringContainer.rotation.x = -Math.PI / 2;
        ringContainer.rotation.y = Math.PI / 6;

        saturn.add(ringContainer);

        // Spara referensen till ringContainer i saturn.userData
        saturn.userData.ringContainer = ringContainer;
    }






    animate() {
        requestAnimationFrame(() => this.animate());
        TWEEN.update();
        const deltaTime = 0.016 * this.speedMultiplier; // Assuming 60 FPS as base
    
        this.planets.forEach(planet => {
            const orbit = planet.userData.orbit;
            planet.userData.orbitalAngle += 0.0005 * planet.userData.speed * this.speedMultiplier;
            const theta = planet.userData.orbitalAngle;
            const r = orbit.semiMajorAxis * (1 - Math.pow(orbit.eccentricity, 2)) / 
                      (1 + orbit.eccentricity * Math.cos(theta));
    
            planet.position.x = r * Math.cos(theta);
            planet.position.z = r * Math.sin(theta);
            planet.position.y = r * Math.sin(theta) * Math.sin(orbit.inclination);
    
            planet.rotation.y += 0.005 * this.speedMultiplier;
    
            if (planet.name === 'Saturnus' && planet.userData.ringContainer) {
                planet.userData.ringContainer.rotation.z = Math.sin(Date.now() * 0.0001) * 0.1;
            }
        });
    
        this.moons.forEach(moon => {
            const parent = moon.userData.parent;
            moon.userData.orbitalAngle += 0.02 * moon.userData.speed * this.speedMultiplier;
            const r = moon.userData.distance;
            const theta = moon.userData.orbitalAngle;
    
            moon.position.x = parent.position.x + r * Math.cos(theta);
            moon.position.y = parent.position.y + r * Math.sin(theta) * Math.sin(0.1);
            moon.position.z = parent.position.z + r * Math.sin(theta);
    
            moon.rotation.y += 0.01 * this.speedMultiplier;
        });
    
        // When focused, update only the target so the user can rotate freely without camera position override.
        if (this.focusedObject && !this.tweeningFocus) {
            this.controls.target.copy(this.focusedObject.position);
        }
    
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

}

const solarSystem = new SolarSystem();
solarSystem.init().catch(error => {
    console.error('Startfel:', error);
    alert('Simulatorfel: ' + error.message);
});