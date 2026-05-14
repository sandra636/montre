import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ======= CONFIGURATION =======
const MODELS_3D = [
    './models/montre1.glb',
    './models/montre1.glb',
    './models/montre1.glb'
];
// =============================

let scene, camera, renderer, loader;
let watchGroup = null;
let currentStream = null;
let currentCameraUtils = null;

// Éléments DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusDiv = document.getElementById('status');
const loadingDiv = document.getElementById('loading');

// Initialisation Three.js
function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Lumières
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);
    const fillLight = new THREE.PointLight(0xffffff, 0.4);
    fillLight.position.set(0, 1, 2);
    scene.add(fillLight);
    
    loader = new GLTFLoader();
}

// Chargement du modèle 3D
function loadWatch(modelPath) {
    if (watchGroup) {
        scene.remove(watchGroup);
        watchGroup = null;
    }
    
    statusDiv.textContent = '📦 Chargement de la montre...';
    loadingDiv.style.display = 'block';
    
    loader.load(modelPath, (gltf) => {
        watchGroup = gltf.scene;
        scene.add(watchGroup);
        watchGroup.visible = false;
        watchGroup.scale.set(0.5, 0.5, 0.5);
        
        loadingDiv.style.display = 'none';
        statusDiv.textContent = '✅ Montre chargée ! Montrez votre poignet';
        statusDiv.style.color = '#00ff00';
    }, undefined, (error) => {
        console.error('Erreur chargement 3D:', error);
        loadingDiv.innerHTML = '⚠️ Erreur chargement modèle 3D. Vérifiez le chemin du fichier .glb';
        statusDiv.textContent = '❌ Modèle 3D introuvable';
    });
}

// Positionnement sur le poignet
function updateWatchPosition(landmarks) {
    if (!watchGroup) return;
    
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    const middleMcp = landmarks[9];
    
    const wristX = (0.5 - wrist.x) * 8;
    const wristY = (0.5 - wrist.y) * 6;
    const wristZ = -wrist.z * 8;
    
    const indexX = (0.5 - indexMcp.x) * 8;
    const indexY = (0.5 - indexMcp.y) * 6;
    const pinkyX = (0.5 - pinkyMcp.x) * 8;
    const pinkyY = (0.5 - pinkyMcp.y) * 6;
    
    const wristWidth = Math.hypot(indexX - pinkyX, indexY - pinkyY);
    const scale = wristWidth * 0.7;
    
    const midX = (0.5 - middleMcp.x) * 8;
    const midY = (0.5 - middleMcp.y) * 6;
    
    watchGroup.visible = true;
    watchGroup.position.set(wristX + (midX - wristX) * 0.1, wristY + (midY - wristY) * 0.1, wristZ + 0.1);
    watchGroup.scale.set(scale, scale, scale);
    
    const angleZ = Math.atan2(midY - wristY, midX - wristX);
    watchGroup.rotation.z = angleZ - Math.PI / 2;
    watchGroup.rotation.x = Math.PI / 2;
    watchGroup.rotation.y = (indexMcp.y - pinkyMcp.y) * 2;
}

// MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        updateWatchPosition(results.multiHandLandmarks[0]);
        statusDiv.textContent = '⌚ Montre placée !';
    } else {
        if (watchGroup) watchGroup.visible = false;
        statusDiv.textContent = '👋 Montrez votre poignet';
        statusDiv.style.color = 'white';
    }
    renderer.render(scene, camera);
});

// Gestion de la caméra
async function startCamera(facingMode) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    try {
        const constraints = {
            video: { facingMode: { exact: facingMode } }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        await video.play();
        
        if (currentCameraUtils) {
            // Nettoyer l'ancienne instance si elle existe
        }
        currentCameraUtils = new Camera(video, {
            onFrame: async () => {
                await hands.send({ image: video });
            },
            width: 1280,
            height: 720
        });
        await currentCameraUtils.start();
        
        statusDiv.textContent = facingMode === 'environment' ? '✅ Caméra arrière active' : '✅ Caméra avant active';
        loadingDiv.style.display = 'none';
        return true;
    } catch (err) {
        console.error('Erreur caméra ' + facingMode, err);
        statusDiv.textContent = '⚠️ Impossible d\'utiliser la caméra sélectionnée';
        return false;
    }
}

async function initCamera() {
    loadingDiv.style.display = 'block';
    statusDiv.textContent = '📷 Démarrage caméra...';
    
    // Tentative caméra arrière
    const backSuccess = await startCamera('environment');
    
    if (!backSuccess) {
        statusDiv.textContent = '📷 Caméra arrière indisponible, utilisation caméra avant...';
        await startCamera('user');
    }
    
    // Bouton de basculement
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) {
        let currentCamera = 'environment';
        switchBtn.addEventListener('click', async () => {
            const newCamera = currentCamera === 'environment' ? 'user' : 'environment';
            currentCamera = newCamera;
            await startCamera(newCamera);
        });
    }
}

// Changement de montre
window.selectWatch = function(index) {
    document.querySelectorAll('.watch-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    loadWatch(MODELS_3D[index]);
};

// Animation Three.js
function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Lancement
function init() {
    initThree();
    animate();
    initCamera();
    setTimeout(() => {
        if (MODELS_3D[0]) loadWatch(MODELS_3D[0]);
    }, 1000);
}

init();

// Redimensionnement
window.addEventListener('resize', () => {
    if (renderer && camera) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
});