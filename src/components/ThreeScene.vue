<template>
  <div ref="container" class="three-container"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { componentCatalogById } from '../data/componentCatalog'

const COMMENT_PARAMETER_NAME = '注释'
const TAP_MOVE_TOLERANCE = 12
const TAP_TIME_TOLERANCE = 450

const props = defineProps({
  modelPath: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['model-loaded', 'part-clicked', 'selection-cleared'])

const container = ref(null)

let scene
let camera
let renderer
let controls
let raycaster
let mouse
let animationFrameId = null
let model = null
let resizeObserver = null
let initialCameraState = null

const activePointers = new Set()
const pointerTracker = {
  pointerId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  maxDistance: 0,
  multiTouch: false
}

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/gltf/')
dracoLoader.preload()

const isCoarsePointer = () =>
  Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
  navigator.maxTouchPoints > 0

const getPixelRatio = () =>
  Math.min(window.devicePixelRatio || 1, isCoarsePointer() ? 1.5 : 2)

const initThree = () => {
  const coarsePointer = isCoarsePointer()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x09111f)

  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    5000
  )
  camera.position.set(60, 40, 80)

  renderer = new THREE.WebGLRenderer({
    antialias: !coarsePointer,
    powerPreference: 'high-performance'
  })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(getPixelRatio())
  renderer.domElement.style.touchAction = 'none'
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = coarsePointer ? 0.08 : 0.05
  controls.enablePan = true
  controls.screenSpacePanning = true
  controls.touches.ONE = THREE.TOUCH.ROTATE
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  controls.target.set(0, 0, 0)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  addLights()
  scene.add(new THREE.AxesHelper(20))
  scene.add(new THREE.GridHelper(200, 40, 0x3e9edc, 0x1f3957))
}

const addLights = () => {
  const shadowMapSize = isCoarsePointer() ? 1024 : 2048

  scene.add(new THREE.AmbientLight(0xffffff, 0.75))

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
  directionalLight.position.set(120, 180, 100)
  directionalLight.castShadow = true
  directionalLight.shadow.camera.left = -200
  directionalLight.shadow.camera.right = 200
  directionalLight.shadow.camera.top = 200
  directionalLight.shadow.camera.bottom = -200
  directionalLight.shadow.mapSize.width = shadowMapSize
  directionalLight.shadow.mapSize.height = shadowMapSize
  scene.add(directionalLight)

  const fillLight = new THREE.PointLight(0x9bdcff, 0.8)
  fillLight.position.set(-80, 120, -60)
  scene.add(fillLight)
}

const flattenParameters = (parameterGroups = []) =>
  parameterGroups.flatMap((group) =>
    (group.Parameters || []).map((parameter) => ({
      groupName: group.GroupName || '',
      name: parameter.name || '',
      value: parameter.value ?? ''
    }))
  )

const getParameterValue = (userData, parameterName) => {
  const parameters = flattenParameters(userData?.Parameters)
  const matchedParameter = parameters.find((parameter) => parameter.name === parameterName)
  return typeof matchedParameter?.value === 'string'
    ? matchedParameter.value.trim()
    : matchedParameter?.value ?? ''
}

const getDisplayName = (object) => object.name || `Mesh_${object.uuid.slice(0, 8)}`

const storeCameraState = () => {
  initialCameraState = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    near: camera.near,
    far: camera.far
  }
}

const fitCameraToModel = (object) => {
  const bounds = new THREE.Box3().setFromObject(object)

  if (bounds.isEmpty()) {
    return
  }

  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const cameraDistance = (maxDimension / (2 * Math.tan(fov / 2))) * 2.2

  camera.position.set(
    center.x + cameraDistance * 0.7,
    center.y + cameraDistance * 0.45,
    center.z + cameraDistance
  )
  camera.near = Math.max(0.1, maxDimension / 500)
  camera.far = Math.max(5000, cameraDistance * 10)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.update()
  storeCameraState()
}

const clearHighlight = () => {
  scene.traverse((child) => {
    if (!child.isMesh || !child.userData.originalMaterial) {
      return
    }

    const highlightMaterial = child.material
    const highlightedMaterials = Array.isArray(highlightMaterial)
      ? highlightMaterial
      : [highlightMaterial]

    highlightedMaterials.forEach((material) => material?.dispose?.())

    child.material = child.userData.originalMaterial
    delete child.userData.originalMaterial
  })
}

const createHighlightMaterial = () =>
  new THREE.MeshBasicMaterial({
    color: 0x00ff9c,
    transparent: true,
    opacity: 0.45
  })

const highlightObject = (object) => {
  clearHighlight()

  if (!object?.isMesh) {
    return
  }

  object.userData.originalMaterial = object.material
  object.material = Array.isArray(object.material)
    ? object.material.map(() => createHighlightMaterial())
    : createHighlightMaterial()
}

const clearSelection = () => {
  clearHighlight()
}

const buildPartInfo = (meshObject, point) => {
  const commentId = getParameterValue(meshObject.userData, COMMENT_PARAMETER_NAME)
  const fallbackId = meshObject.userData.ElementID
    ? String(meshObject.userData.ElementID)
    : meshObject.uuid
  const id = commentId || fallbackId

  return {
    id,
    commentId,
    name: getDisplayName(meshObject),
    elementId: meshObject.userData.ElementID
      ? String(meshObject.userData.ElementID)
      : '',
    uniqueId: meshObject.userData.UniqueId || '',
    catalogEntry: componentCatalogById[id] || null,
    position: {
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
      z: Number(point.z.toFixed(3))
    }
  }
}

const loadModel = async () => {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)

  try {
    const gltf = await loader.loadAsync(props.modelPath)
    model = gltf.scene
    model.position.set(0, 0, 0)

    model.traverse((child) => {
      if (!child.isMesh) {
        return
      }

      child.castShadow = true
      child.receiveShadow = true
      child.userData.commentId = getParameterValue(child.userData, COMMENT_PARAMETER_NAME)
      child.userData.displayName = getDisplayName(child)
    })

    scene.add(model)
    fitCameraToModel(model)
    emit('model-loaded')
  } catch (error) {
    console.error('Error loading model:', error)
  }
}

const findPreferredIntersection = (intersections) => {
  const selectableIntersection = intersections.find(({ object }) =>
    Boolean(getParameterValue(object.userData, COMMENT_PARAMETER_NAME))
  )

  return selectableIntersection || intersections[0] || null
}

const selectAtClientPoint = (clientX, clientY) => {
  if (!model) {
    return
  }

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)

  const intersections = raycaster.intersectObject(model, true)
  const preferredIntersection = findPreferredIntersection(intersections)

  if (!preferredIntersection?.object?.isMesh) {
    clearSelection()
    emit('selection-cleared')
    return
  }

  highlightObject(preferredIntersection.object)
  emit('part-clicked', buildPartInfo(preferredIntersection.object, preferredIntersection.point))
}

const resetPointerTracker = () => {
  pointerTracker.pointerId = null
  pointerTracker.startX = 0
  pointerTracker.startY = 0
  pointerTracker.startTime = 0
  pointerTracker.maxDistance = 0
  pointerTracker.multiTouch = false
}

const onPointerDown = (event) => {
  activePointers.add(event.pointerId)

  if (activePointers.size > 1) {
    pointerTracker.multiTouch = true
  }

  if (!event.isPrimary || activePointers.size > 1) {
    return
  }

  pointerTracker.pointerId = event.pointerId
  pointerTracker.startX = event.clientX
  pointerTracker.startY = event.clientY
  pointerTracker.startTime = performance.now()
  pointerTracker.maxDistance = 0
}

const onPointerMove = (event) => {
  if (activePointers.size > 1) {
    pointerTracker.multiTouch = true
  }

  if (pointerTracker.pointerId !== event.pointerId) {
    return
  }

  const offsetX = event.clientX - pointerTracker.startX
  const offsetY = event.clientY - pointerTracker.startY
  pointerTracker.maxDistance = Math.max(
    pointerTracker.maxDistance,
    Math.hypot(offsetX, offsetY)
  )
}

const onPointerUp = (event) => {
  const tapDuration = performance.now() - pointerTracker.startTime
  const shouldSelect =
    pointerTracker.pointerId === event.pointerId &&
    !pointerTracker.multiTouch &&
    pointerTracker.maxDistance <= TAP_MOVE_TOLERANCE &&
    tapDuration <= TAP_TIME_TOLERANCE

  activePointers.delete(event.pointerId)

  if (shouldSelect) {
    selectAtClientPoint(event.clientX, event.clientY)
  }

  if (pointerTracker.pointerId === event.pointerId || activePointers.size === 0) {
    resetPointerTracker()
  }
}

const onPointerCancel = (event) => {
  activePointers.delete(event.pointerId)

  if (pointerTracker.pointerId === event.pointerId || activePointers.size === 0) {
    resetPointerTracker()
  }
}

const animate = () => {
  animationFrameId = requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

const onWindowResize = () => {
  if (!container.value || !camera || !renderer) {
    return
  }

  camera.aspect = container.value.clientWidth / container.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(getPixelRatio())
}

const observeContainerResize = () => {
  if (typeof ResizeObserver !== 'function' || !container.value) {
    return
  }

  resizeObserver = new ResizeObserver(() => {
    onWindowResize()
  })
  resizeObserver.observe(container.value)
}

const resetView = () => {
  if (!camera || !controls || !initialCameraState) {
    return
  }

  camera.position.copy(initialCameraState.position)
  camera.near = initialCameraState.near
  camera.far = initialCameraState.far
  camera.updateProjectionMatrix()
  controls.target.copy(initialCameraState.target)
  controls.update()
}

const unloadModel = () => {
  if (!model) {
    return
  }

  clearHighlight()
  scene.remove(model)
  model = null
}

onMounted(() => {
  initThree()
  loadModel()
  animate()
  observeContainerResize()

  window.addEventListener('resize', onWindowResize)
  window.visualViewport?.addEventListener('resize', onWindowResize)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  window.visualViewport?.removeEventListener('resize', onWindowResize)
  resizeObserver?.disconnect()

  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }

  unloadModel()
  dracoLoader.dispose()
  controls?.dispose()
  renderer?.dispose()
})

watch(
  () => props.modelPath,
  async () => {
    unloadModel()
    await loadModel()
  }
)

defineExpose({
  clearSelection,
  resetView
})
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
