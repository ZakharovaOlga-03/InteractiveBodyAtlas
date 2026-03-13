// Создаем контейнер, который будет двигаться с камерой
const lightHolder = new THREE.Object3D();
scene.add(lightHolder); // Добавляем в сцену, но позицию будем обновлять вручную

// Добавляем свет в контейнер
const cameraLight = new THREE.PointLight(0xffffff, 1.5);
cameraLight.position.set(0, 1, 2); // Относительно камеры: сверху и спереди
lightHolder.add(cameraLight);

// Добавляем второй свет для подсветки снизу
const bottomLight = new THREE.PointLight(0x4466ff, 0.5);
bottomLight.position.set(0, -1, 1); // Снизу относительно камеры
lightHolder.add(bottomLight);

// Добавляем окружающий свет (не двигается)
const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);

// --- Заполняющие статические источники (для теней и объема) ---
const staticLight1 = new THREE.PointLight(0xffaa66, 0.3);
staticLight1.position.set(3, 2, 3);
scene.add(staticLight1);

const staticLight2 = new THREE.PointLight(0x66aaff, 0.3);
staticLight2.position.set(-3, 1, 3);
scene.add(staticLight2);

function moving_light(){ //вставить в функцию animate
    if (camera && lightHolder) {
        // Копируем позицию камеры
        lightHolder.position.copy(camera.position);
        
        // Копируем поворот камеры (чтобы свет оставался ориентированным относительно камеры)
        lightHolder.quaternion.copy(camera.quaternion);
    }
}