import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { anatomyCategories } from './anatomy-categories.js';
import { AtlasSceneLibrary } from './atlas-scene-library.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = true;

const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(2, 5, 3);
scene.add(directionalLight);

const backLight = new THREE.PointLight(0x4466ff, 0.5);
backLight.position.set(-2, 1, -3);
scene.add(backLight);

let atlas = null;

const testGroupOverrides = {
    bones: ['Cube', 'Torus', 'Suzanne'],
    muscles: ['Cone'],
    organs: ['Icosphere'],
    nerves: ['Suzanne'],
    arteries: ['Torus']
};

function isSurfacesName(name) {
    const n = String(name || '').toLowerCase();
    return (
        n.includes('surface') ||
        n.includes('dorsal') ||
        n.includes('palmar') ||
        n.includes('plantar') ||
        n.includes('region') ||
        n.includes('border')
    );
}

function isLandmarksName(name) {
    const n = String(name || '').toLowerCase();
    return (
        n.includes('triangle') ||
        n.includes('fossa') ||
        n.includes('sulcus') ||
        n.includes('gyrus') ||
        n.includes('foramen') ||
        n.includes('canal') ||
        n.includes('process')
    );
}

function matchesKeywords(name, keywords) {
    const n = String(name || '').toLowerCase();
    return keywords.some((k) => n.includes(String(k).toLowerCase()));
}

function matchesOverride(groupName, nodeName) {
    const list = testGroupOverrides[groupName];
    if (!list || !list.length) return false;
    const n = String(nodeName || '').trim();
    return list.includes(n);
}

function buildGroupRules() {
    const rules = {};
    Object.entries(anatomyCategories).forEach(([cat, config]) => {
        const keywords = config.keywords || [];
        rules[cat] = (node) => matchesOverride(cat, node?.name) || matchesKeywords(node?.name, keywords);
    });
    rules.surfaces = (node) => isSurfacesName(node?.name);
    rules.landmarks = (node) => isLandmarksName(node?.name);
    return rules;
}

function createGroupControls() {
    let container = document.getElementById('group-panel');
    if (!container) {
        container = document.createElement('div');
        container.id = 'group-panel';
        container.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(30, 30, 40, 0.95);
            color: white;
            padding: 15px;
            border-radius: 8px;
            max-height: 90vh;
            overflow-y: auto;
            z-index: 1000;
            width: 300px;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            border: 1px solid #444;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Groups';
        title.style.cssText = `
            margin-top: 0;
            margin-bottom: 15px;
            text-align: center;
            color: #aaccff;
            border-bottom: 1px solid #555;
            padding-bottom: 8px;
        `;
        container.appendChild(title);

        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'group-controls';
        container.appendChild(controlsDiv);

        document.body.appendChild(container);
    }

    const controlsContainer = document.getElementById('group-controls');
    if (!controlsContainer) return;
    controlsContainer.innerHTML = '';

    const buttonDiv = document.createElement('div');
    buttonDiv.style.cssText = `
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
        justify-content: space-between;
    `;

    const showAllBtn = document.createElement('button');
    showAllBtn.textContent = 'Show all';
    showAllBtn.title = 'Show all groups';
    showAllBtn.style.cssText = `
        background: #2a6f97;
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
    `;
    showAllBtn.onclick = () => {
        if (!atlas) return;
        atlas.showAll();
        const boxes = controlsContainer.querySelectorAll('input[type="checkbox"][data-group]');
        boxes.forEach((b) => {
            b.checked = true;
        });
    };

    const hideAllBtn = document.createElement('button');
    hideAllBtn.textContent = 'Hide all';
    hideAllBtn.title = 'Hide all groups';
    hideAllBtn.style.cssText = `
        background: #972a2a;
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
    `;
    hideAllBtn.onclick = () => {
        if (!atlas) return;
        atlas.hideAll();
        const boxes = controlsContainer.querySelectorAll('input[type="checkbox"][data-group]');
        boxes.forEach((b) => {
            b.checked = false;
        });
    };

    buttonDiv.appendChild(showAllBtn);
    buttonDiv.appendChild(hideAllBtn);
    controlsContainer.appendChild(buttonDiv);

    const separator = document.createElement('hr');
    separator.style.cssText = `
        border: none;
        border-top: 1px solid #555;
        margin: 10px 0;
    `;
    controlsContainer.appendChild(separator);

    const groups = atlas ? atlas.getGroupNames() : [];
    groups.forEach((groupName) => {
        const div = document.createElement('div');
        div.style.cssText = `
            margin: 8px 0;
            display: flex;
            align-items: center;
            padding: 4px;
            border-radius: 4px;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = false;
        checkbox.dataset.group = groupName;
        checkbox.id = `group-${groupName}`;
        checkbox.title = `Toggle group visibility: ${groupName}`;
        checkbox.style.marginRight = '8px';
        checkbox.addEventListener('change', (e) => {
            if (!atlas) return;
            const isVisible = Boolean(e.target.checked);
            if (isVisible) atlas.showGroup(groupName);
            else atlas.hideGroup(groupName);
        });

        const label = document.createElement('label');
        label.htmlFor = `group-${groupName}`;
        label.style.cssText = `
            cursor: pointer;
            flex: 1;
            display: flex;
            justify-content: space-between;
        `;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = groupName;

        label.appendChild(nameSpan);
        div.appendChild(checkbox);
        div.appendChild(label);
        controlsContainer.appendChild(div);
    });

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `
        margin-top: 15px;
        font-size: 0.8em;
        color: #888;
        text-align: center;
        border-top: 1px solid #555;
        padding-top: 8px;
    `;
    infoDiv.textContent = atlas ? `Elements: ${atlas.getElementIds().length}` : '';
    controlsContainer.appendChild(infoDiv);
}

async function loadAtlasScene() {
    const infoDiv = document.getElementById('info');
    if (infoDiv) infoDiv.textContent = 'Loading scene...';

    atlas = new AtlasSceneLibrary({
        scene,
        groupRules: buildGroupRules()
    });

    await atlas.load(
        './test_scene.glb',
        {
            onProgress: (xhr) => {
                if (!xhr || !xhr.total) return;
                const percent = (xhr.loaded / xhr.total) * 100;
                const d = document.getElementById('info');
                if (d) d.textContent = `Loading: ${percent.toFixed(0)}%`;
            }
        }
    );

    atlas.root.scale.set(5, 5, 5);
    atlas.root.position.set(0, -5, 0);
    atlas.root.traverse((node) => {
        if (node && node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    window.Atlas = atlas;
    console.log('AtlasSceneLibrary - Loaded. Public API: window.Atlas');
    console.log('AtlasSceneLibrary - Groups:', atlas.getGroupNames());

    const d = document.getElementById('info');
    if (d) d.textContent = 'Ready. All hidden by default.';

    createGroupControls();
}

loadAtlasScene().catch((err) => {
    console.error('AtlasSceneLibrary - Load failed:', err);
    const d = document.getElementById('info');
    if (d) d.textContent = 'Load failed. See console.';
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}