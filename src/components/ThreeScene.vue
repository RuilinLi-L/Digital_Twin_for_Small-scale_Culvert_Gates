<template>
  <div ref="container" class="three-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps({
  modelPath: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['model-loaded', 'part-clicked'])

const container = ref(null)
let scene, camera, renderer, controls, raycaster, mouse
let model = null

// Three.js初始化
const initThree = () => {
  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  )
  camera.position.set(5, 3, 5)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.value.appendChild(renderer.domElement)

  // 添加控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05

  // 初始化射线检测
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  // 添加光照
  addLights()

  // 添加坐标轴辅助
  const axesHelper = new THREE.AxesHelper(5)
  scene.add(axesHelper)

  // 添加网格地面
  const gridHelper = new THREE.GridHelper(20, 20)
  scene.add(gridHelper)
}

// 添加光照
const addLights = () => {
  // 环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  // 方向光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(10, 20, 15)
  directionalLight.castShadow = true
  directionalLight.shadow.camera.left = -20
  directionalLight.shadow.camera.right = 20
  directionalLight.shadow.camera.top = 20
  directionalLight.shadow.camera.bottom = -20
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  scene.add(directionalLight)

  // 点光源
  const pointLight = new THREE.PointLight(0xffffff, 0.5)
  pointLight.position.set(-10, 10, -10)
  scene.add(pointLight)
}

// 加载GLTF模型
const loadModel = async () => {
  const loader = new GLTFLoader()

  try {
    const gltf = await loader.loadAsync(props.modelPath)
    model = gltf.scene

    // 调整模型位置和缩放
    model.position.set(0, 0, 0)
    model.scale.set(0.01, 0.01, 0.01) // 根据模型大小调整

    // 为所有网格添加点击检测
    model.traverse((child) => {
      if (child.isMesh) {
        // 为每个网格设置唯一ID
        child.userData.id = child.uuid
        child.userData.name = child.name || `Mesh_${child.uuid.substring(0, 8)}`

        // 启用阴影
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    scene.add(model)
    emit('model-loaded')

    // 调整相机位置以适合模型
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2))

    camera.position.set(center.x, center.y, cameraZ * 1.5)
    controls.target.copy(center)
    controls.update()

  } catch (error) {
    console.error('Error loading model:', error)
  }
}

// 处理点击事件
const onMouseClick = (event) => {
  if (!model) return

  // 计算鼠标在归一化设备坐标中的位置
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  // 更新射线
  raycaster.setFromCamera(mouse, camera)

  // 计算与模型的所有交点
  const intersects = raycaster.intersectObject(model, true)

  if (intersects.length > 0) {
    const clickedObject = intersects[0].object

    // 向上查找最近的网格对象
    let meshObject = clickedObject
    while (meshObject && !meshObject.isMesh) {
      meshObject = meshObject.parent
    }

    if (meshObject && meshObject.isMesh) {
      const partInfo = {
        id: meshObject.userData.id,
        name: meshObject.userData.name,
        position: intersects[0].point
      }

      emit('part-clicked', partInfo)

      // 高亮选中的部件（可选）
      highlightObject(meshObject)
    }
  }
}

// 高亮选中的对象
const highlightObject = (object) => {
  // 先清除之前的高亮
  scene.traverse((child) => {
    if (child.isMesh && child.userData.originalMaterial) {
      child.material = child.userData.originalMaterial
      delete child.userData.originalMaterial
    }
  })

  // 保存原始材质并应用高亮材质
  if (object.isMesh) {
    object.userData.originalMaterial = object.material

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5
    })

    object.material = highlightMaterial
  }
}

// 动画循环
const animate = () => {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

// 处理窗口大小变化
const onWindowResize = () => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
}

// 组件挂载
onMounted(() => {
  initThree()
  loadModel()
  animate()

  // 添加事件监听
  window.addEventListener('resize', onWindowResize)
  renderer.domElement.addEventListener('click', onMouseClick)
})

// 组件卸载
onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  renderer.domElement.removeEventListener('click', onMouseClick)

  // 清理Three.js资源
  if (renderer) {
    renderer.dispose()
  }
})

// 监听模型路径变化
watch(() => props.modelPath, () => {
  if (model) {
    scene.remove(model)
    model = null
  }
  loadModel()
})
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>