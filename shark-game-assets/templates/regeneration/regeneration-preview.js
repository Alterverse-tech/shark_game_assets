import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const list = document.getElementById("list");
const stage = document.getElementById("stage");
const statusNode = document.getElementById("status");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.shadowMap.enabled = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x131720);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
camera.position.set(3.2, 2.3, 4.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.1, 0);

scene.add(new THREE.HemisphereLight(0xf2f5ff, 0x443735, 2.2));
const key = new THREE.DirectionalLight(0xffefd2, 3);
key.position.set(4, 7, 5);
key.castShadow = true;
scene.add(key);
scene.add(new THREE.GridHelper(8, 16, 0x66707d, 0x303743));

const root = new THREE.Group();
scene.add(root);
const loader = new GLTFLoader();
const clock = new THREE.Clock();
let mixer;
let current;
let activeUrl = "";
let lastSignature = "";

resize();
window.addEventListener("resize", resize);
requestAnimationFrame(tick);
poll();
setInterval(poll, 2000);

async function poll() {
  try {
    const response = await fetch(`./regeneration-status.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    renderStatus(data);
  } catch (error) {
    statusNode.textContent = `等待状态文件：${error.message}`;
  }
}

function renderStatus(data) {
  statusNode.innerHTML = `<b>${escapeHtml(data.status || "unknown")}</b><br>${escapeHtml(data.message || "")}`;
  const items = data.items || [];
  const signature = JSON.stringify(items.map((item) => [item.id, item.status, item.progress, item.runtimeUrl]));
  if (signature === lastSignature) return;
  lastSignature = signature;
  list.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item${item.runtimeUrl ? " ready" : ""}${item.runtimeUrl === activeUrl ? " active" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(item.name || item.id)}</strong><span>${escapeHtml(item.status || "pending")} · ${Math.round(item.progress || 0)}%</span><progress max="100" value="${Number(item.progress || 0)}"></progress>`;
    button.disabled = !item.runtimeUrl;
    button.addEventListener("click", () => loadModel(item.runtimeUrl, item.name || item.id));
    list.appendChild(button);
  }
  const firstReady = items.find((item) => item.runtimeUrl);
  if (!activeUrl && firstReady) loadModel(firstReady.runtimeUrl, firstReady.name || firstReady.id);
}

function loadModel(url, label) {
  activeUrl = url;
  clearCurrent();
  statusNode.innerHTML = `<b>${escapeHtml(label)}</b><br>${escapeHtml(url)}`;
  loader.load(
    url,
    (gltf) => {
      current = gltf.scene;
      current.traverse((obj) => {
        if (obj.isMesh || obj.isSkinnedMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      normalize(current);
      root.add(current);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(current);
        mixer.clipAction(gltf.animations[0]).play();
      }
    },
    undefined,
    (error) => {
      statusNode.innerHTML = `模型加载失败：${escapeHtml(error.message || String(error))}`;
    }
  );
}

function clearCurrent() {
  mixer = undefined;
  if (!current) return;
  root.remove(current);
  current.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose?.());
    else obj.material?.dispose?.();
  });
  current = undefined;
}

function normalize(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2.6 / Math.max(size.x, size.y, size.z, 0.001);
  object.scale.setScalar(scale);
  object.updateWorldMatrix(true, true);
  const nextBox = new THREE.Box3().setFromObject(object);
  const center = nextBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= nextBox.min.y;
  root.rotation.y = 0;
  controls.target.set(0, 1.2, 0);
  controls.update();
}

function resize() {
  const box = stage.getBoundingClientRect();
  renderer.setSize(box.width, box.height, false);
  camera.aspect = box.width / Math.max(1, box.height);
  camera.updateProjectionMatrix();
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  mixer?.update(dt);
  if (current) root.rotation.y += dt * 0.28;
  controls.update();
  renderer.render(scene, camera);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
