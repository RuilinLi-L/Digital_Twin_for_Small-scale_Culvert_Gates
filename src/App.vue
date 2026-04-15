<template>
  <div class="app-container">
    <ThreeScene
      :modelPath="modelPath"
      @model-loaded="onModelLoaded"
      @part-clicked="onPartClicked"
    />

    <div v-if="loading" class="loading-overlay">
      正在加载简易测试模型...
    </div>

    <div class="status-overlay">
      <h3>测试配置</h3>
      <p><strong>模型:</strong> simple-test.gltf（来源：简易.gltf）</p>
      <p><strong>ID 来源:</strong> Revit 构件属性“注释”</p>
      <p><strong>ID 表:</strong> {{ catalogSummary }}</p>
      <p><strong>后端同步:</strong> {{ backendStatusText }}</p>
    </div>

    <div v-if="selectedPart" class="info-overlay">
      <h3>选中构件</h3>
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
      <button @click="clearSelection">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import ThreeScene from './components/ThreeScene.vue'
import { componentCatalog } from './data/componentCatalog'

const modelPath = '/models/simple-test.gltf'
const backendUrl = (import.meta.env.VITE_COMPONENT_ID_API_URL || '').trim()

const loading = ref(true)
const selectedPart = ref(null)
const lastSyncStatus = ref(
  backendUrl
    ? `已配置 ${backendUrl}`
    : '未配置 VITE_COMPONENT_ID_API_URL，当前先验证统一 ID 提取'
)

const catalogSummary = computed(() => `${componentCatalog.length} 条映射（ID 1-6）`)
const backendStatusText = computed(() => lastSyncStatus.value)

const onModelLoaded = () => {
  loading.value = false
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
}

const clearSelection = () => {
  selectedPart.value = null
}
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  position: relative;
}

.loading-overlay,
.status-overlay,
.info-overlay {
  position: absolute;
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
  padding: 20px 24px;
  font-size: 18px;
}

.status-overlay {
  top: 20px;
  right: 20px;
  width: min(360px, calc(100vw - 40px));
  padding: 16px 18px;
}

.info-overlay {
  top: 20px;
  left: 20px;
  width: min(360px, calc(100vw - 40px));
  padding: 16px 18px;
}

.status-overlay h3,
.info-overlay h3 {
  margin: 0 0 12px;
  color: #8de2ff;
}

.status-overlay p,
.info-overlay p {
  margin: 0 0 8px;
  line-height: 1.45;
  word-break: break-word;
}

.info-overlay button {
  background: #1d9bf0;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
  margin-top: 10px;
}

.info-overlay button:hover {
  background: #0f82d1;
}

@media (max-width: 768px) {
  .status-overlay,
  .info-overlay {
    width: calc(100vw - 24px);
  }

  .status-overlay {
    top: auto;
    bottom: 20px;
    right: 12px;
  }

  .info-overlay {
    top: 12px;
    left: 12px;
  }
}
</style>
