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

const props = defineProps({
  modelPath: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['model-loaded', 'part-clicked'])

const container = ref(null)

let scene
let camera
let renderer
let controls
let raycaster
let mouse
let animationFrameId = null
let model = null

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/gltf/')
dracoLoader.preload()

const initThree = () => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x09111f)

  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    5000
  )
  camera.position.set(60, 40, 80)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.target.set(0, 0, 0)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  addLights()
  scene.add(new THREE.AxesHelper(20))
  scene.add(new THREE.GridHelper(200, 40, 0x3e9edc, 0x1f3957))
}

const addLights = () => {
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
  directionalLight.position.set(120, 180, 100)
  directionalLight.castShadow = true
  directionalLight.shadow.camera.left = -200
  directionalLight.shadow.camera.right = 200
  directionalLight.shadow.camera.top = 200
  directionalLight.shadow.camera.bottom = -200
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
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

const onMouseClick = (event) => {
  if (!model) {
    return
  }

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)

  const intersections = raycaster.intersectObject(model, true)
  const preferredIntersection = findPreferredIntersection(intersections)

  if (!preferredIntersection?.object?.isMesh) {
    return
  }

  highlightObject(preferredIntersection.object)
  emit('part-clicked', buildPartInfo(preferredIntersection.object, preferredIntersection.point))
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

  window.addEventListener('resize', onWindowResize)
  renderer.domElement.addEventListener('click', onMouseClick)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)

  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('click', onMouseClick)
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }

  unloadModel()
  dracoLoader.dispose()
  renderer?.dispose()
})

watch(
  () => props.modelPath,
  async () => {
    unloadModel()
    await loadModel()
  }
)
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
