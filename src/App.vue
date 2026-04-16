<template>
  <div class="app-shell">
    <ThreeScene
      ref="sceneRef"
      class="scene-layer"
      :modelPath="modelPath"
      @model-loaded="onModelLoaded"
      @part-clicked="onPartClicked"
      @selection-cleared="onSelectionCleared"
    />

    <div v-if="loading" class="loading-overlay">
      <strong>正在加载模型</strong>
      <span>首次进入会初始化 3D 资源，移动端可能需要几秒钟。</span>
    </div>

    <header class="scene-header">
      <div class="project-card">
        <p class="eyebrow">数字孪生演示</p>
        <h1>小型涵闸三维查看器</h1>
        <p class="interaction-hint">{{ interactionHint }}</p>
      </div>

      <div class="header-actions">
        <button type="button" class="ghost-button" @click="toggleStatusPanel">
          {{ showStatusPanel ? '收起配置' : '查看配置' }}
        </button>
        <button type="button" class="primary-button" @click="resetCamera">
          复位视角
        </button>
      </div>
    </header>

    <aside v-if="showStatusPanel" class="overlay-panel status-panel">
      <h2>模型与同步</h2>
      <p><strong>模型:</strong> simple-test.gltf（来源：简易.gltf）</p>
      <p><strong>ID 来源:</strong> Revit 构件属性“注释”</p>
      <p><strong>ID 表:</strong> {{ catalogSummary }}</p>
      <p><strong>后端同步:</strong> {{ backendStatusText }}</p>
      <p><strong>当前布局:</strong> {{ isCompactLayout ? '移动端 / 窄屏' : '桌面端 / 宽屏' }}</p>
    </aside>

    <section v-if="selectedPart && showInfoPanel" class="overlay-panel info-panel">
      <h2>选中构件</h2>
      <p><strong>统一 ID:</strong> {{ selectedPart.id }}</p>
      <p><strong>构件名称:</strong> {{ selectedPart.catalogEntry?.componentName || '未在表内匹配' }}</p>
      <p><strong>模型名称:</strong> {{ selectedPart.name || '未命名' }}</p>
      <p><strong>参数:</strong> {{ selectedPart.catalogEntry?.material || '未匹配' }}</p>
      <p><strong>Revit 注释:</strong> {{ selectedPart.commentId || '未填写' }}</p>
      <p><strong>ElementID:</strong> {{ selectedPart.elementId || '无' }}</p>
      <p><strong>UniqueId:</strong> {{ selectedPart.uniqueId || '无' }}</p>
      <p><strong>后端发送:</strong> {{ selectedPart.syncStatus.label }}</p>
      <p v-if="selectedPart.syncStatus.message">
        <strong>说明:</strong> {{ selectedPart.syncStatus.message }}
      </p>

      <div class="info-actions">
        <button type="button" class="ghost-button" @click="toggleInfoPanel">
          收起面板
        </button>
        <button type="button" class="primary-button" @click="clearSelection">
          清除选中
        </button>
      </div>
    </section>

    <div class="bottom-toolbar">
      <button
        type="button"
        class="toolbar-button"
        :disabled="!selectedPart"
        @click="toggleInfoPanel"
      >
        {{ infoToggleLabel }}
      </button>
      <button type="button" class="toolbar-button" @click="toggleStatusPanel">
        {{ showStatusPanel ? '隐藏配置' : '显示配置' }}
      </button>
      <button type="button" class="toolbar-button toolbar-button--primary" @click="resetCamera">
        复位视角
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import { componentCatalog } from './data/componentCatalog'

const modelPath = '/models/simple-test.gltf'
const backendUrl = (import.meta.env.VITE_COMPONENT_ID_API_URL || '').trim()

const loading = ref(true)
const sceneRef = ref(null)
const selectedPart = ref(null)
const showStatusPanel = ref(true)
const showInfoPanel = ref(false)
const isCompactLayout = ref(false)
const lastSyncStatus = ref(
  backendUrl
    ? `已配置 ${backendUrl}`
    : '未配置 VITE_COMPONENT_ID_API_URL，当前先验证统一 ID 提取'
)
let compactMediaQuery = null

const catalogSummary = computed(() => `${componentCatalog.length} 条映射（ID 1-6）`)
const backendStatusText = computed(() => lastSyncStatus.value)
const interactionHint = computed(() =>
  isCompactLayout.value
    ? '单指旋转，双指缩放，轻点模型即可选中构件。'
    : '拖拽旋转视角，滚轮缩放，单击模型即可选中构件。'
)
const infoToggleLabel = computed(() => {
  if (!selectedPart.value) {
    return '未选中构件'
  }

  return showInfoPanel.value ? '隐藏构件信息' : '显示构件信息'
})

const onModelLoaded = () => {
  loading.value = false
}

const syncResponsiveMode = (matches) => {
  isCompactLayout.value = matches
  showStatusPanel.value = !matches
  showInfoPanel.value = Boolean(selectedPart.value)
}

const buildBackendPayload = (partInfo) => ({
  ID: partInfo.id,
  commentId: partInfo.commentId || null,
  elementId: partInfo.elementId || null,
  uniqueId: partInfo.uniqueId || null,
  modelName: partInfo.name || null,
  componentName: partInfo.catalogEntry?.componentName || null,
  material: partInfo.catalogEntry?.material || null,
  position: partInfo.position
})

const syncSelectionToBackend = async (partInfo) => {
  const payload = buildBackendPayload(partInfo)

  if (!backendUrl) {
    const message = '未配置后端地址，已在控制台输出待发送 payload'
    console.info('[component-selection payload]', payload)
    lastSyncStatus.value = message

    return {
      label: '未发送',
      message,
      payload
    }
  }

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const message = `已发送到 ${backendUrl}`
    lastSyncStatus.value = message

    return {
      label: '已发送',
      message,
      payload
    }
  } catch (error) {
    const message = `发送失败：${error.message}`
    console.error('[component-selection sync error]', error)
    lastSyncStatus.value = message

    return {
      label: '发送失败',
      message,
      payload
    }
  }
}

const onPartClicked = async (partInfo) => {
  const syncStatus = await syncSelectionToBackend(partInfo)
  selectedPart.value = {
    ...partInfo,
    syncStatus
  }
  showInfoPanel.value = true

  if (isCompactLayout.value) {
    showStatusPanel.value = false
  }
}

const onSelectionCleared = () => {
  selectedPart.value = null
  showInfoPanel.value = false
}

const toggleStatusPanel = () => {
  const nextVisible = !showStatusPanel.value
  showStatusPanel.value = nextVisible

  if (isCompactLayout.value && nextVisible) {
    showInfoPanel.value = false
  }
}

const toggleInfoPanel = () => {
  if (!selectedPart.value) {
    return
  }

  const nextVisible = !showInfoPanel.value
  showInfoPanel.value = nextVisible

  if (isCompactLayout.value && nextVisible) {
    showStatusPanel.value = false
  }
}

const resetCamera = () => {
  sceneRef.value?.resetView?.()
}

const clearSelection = () => {
  selectedPart.value = null
  showInfoPanel.value = false
  sceneRef.value?.clearSelection?.()
}

const handleBreakpointChange = (event) => {
  syncResponsiveMode(event.matches)
}

onMounted(() => {
  if (!window.matchMedia) {
    return
  }

  compactMediaQuery = window.matchMedia('(max-width: 900px)')
  syncResponsiveMode(compactMediaQuery.matches)

  if (typeof compactMediaQuery.addEventListener === 'function') {
    compactMediaQuery.addEventListener('change', handleBreakpointChange)
    return
  }

  compactMediaQuery.addListener(handleBreakpointChange)
})

onBeforeUnmount(() => {
  if (!compactMediaQuery) {
    return
  }

  if (typeof compactMediaQuery.removeEventListener === 'function') {
    compactMediaQuery.removeEventListener('change', handleBreakpointChange)
    return
  }

  compactMediaQuery.removeListener(handleBreakpointChange)
})
</script>

<style scoped>
.app-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  overflow: clip;
  background:
    radial-gradient(circle at top left, rgba(35, 112, 189, 0.24), transparent 30%),
    linear-gradient(180deg, rgba(7, 15, 29, 0.2), rgba(7, 15, 29, 0.88));
}

.scene-layer {
  position: absolute;
  inset: 0;
}

.loading-overlay,
.scene-header,
.overlay-panel,
.bottom-toolbar {
  position: absolute;
  z-index: 2;
}

.loading-overlay,
.project-card,
.header-actions,
.overlay-panel,
.bottom-toolbar {
  color: white;
  background: rgba(11, 18, 32, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(135, 206, 235, 0.2);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.loading-overlay {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  min-width: min(320px, calc(100vw - 40px));
  padding: 20px 24px;
  text-align: center;
  font-size: 16px;
}

.loading-overlay strong {
  font-size: 18px;
}

.scene-header {
  top: calc(20px + env(safe-area-inset-top));
  left: calc(20px + env(safe-area-inset-left));
  right: calc(20px + env(safe-area-inset-right));
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  pointer-events: none;
}

.project-card,
.header-actions,
.overlay-panel,
.bottom-toolbar {
  pointer-events: auto;
}

.project-card {
  max-width: min(460px, 48vw);
  padding: 16px 18px;
}

.eyebrow {
  margin-bottom: 8px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8de2ff;
}

.project-card h1,
.overlay-panel h2 {
  margin: 0;
}

.project-card h1 {
  font-size: clamp(22px, 3vw, 32px);
}

.interaction-hint {
  margin: 10px 0 0;
  color: rgba(235, 244, 255, 0.8);
  line-height: 1.45;
}

.header-actions {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.overlay-panel {
  width: min(360px, calc(100vw - 40px));
  padding: 16px 18px;
}

.status-panel {
  top: calc(132px + env(safe-area-inset-top));
  right: calc(20px + env(safe-area-inset-right));
}

.info-panel {
  top: calc(20px + env(safe-area-inset-top));
  left: calc(20px + env(safe-area-inset-left));
}

.overlay-panel h2 {
  margin-bottom: 12px;
  color: #8de2ff;
  font-size: 18px;
}

.overlay-panel p {
  margin: 0 0 8px;
  line-height: 1.55;
  word-break: break-word;
}

.info-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.ghost-button,
.primary-button,
.toolbar-button {
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;
}

.ghost-button {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.primary-button,
.toolbar-button--primary {
  background: #1d9bf0;
  color: white;
}

.ghost-button:hover,
.primary-button:hover,
.toolbar-button:hover {
  transform: translateY(-1px);
}

.primary-button:hover,
.toolbar-button--primary:hover {
  background: #0f82d1;
}

.toolbar-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.bottom-toolbar {
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  max-width: min(720px, calc(100vw - 40px));
  padding: 10px;
}

.toolbar-button {
  min-height: 44px;
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

@media (max-width: 900px) {
  .scene-header {
    flex-direction: column;
    gap: 12px;
  }

  .project-card,
  .header-actions {
    width: 100%;
    max-width: none;
  }

  .header-actions {
    justify-content: space-between;
  }

  .overlay-panel {
    left: calc(12px + env(safe-area-inset-left));
    right: calc(12px + env(safe-area-inset-right));
    width: auto;
    max-height: min(40vh, 320px);
    max-height: min(40dvh, 320px);
    overflow-y: auto;
  }

  .status-panel,
  .info-panel {
    top: auto;
    bottom: calc(84px + env(safe-area-inset-bottom));
  }

  .bottom-toolbar {
    left: calc(12px + env(safe-area-inset-left));
    right: calc(12px + env(safe-area-inset-right));
    bottom: calc(12px + env(safe-area-inset-bottom));
    transform: none;
    width: auto;
    justify-content: space-between;
  }

  .toolbar-button {
    flex: 1;
    min-width: 0;
    padding-inline: 12px;
  }

  .info-actions {
    flex-direction: column;
  }

  .ghost-button,
  .primary-button,
  .toolbar-button {
    min-height: 44px;
  }
}
</style>
