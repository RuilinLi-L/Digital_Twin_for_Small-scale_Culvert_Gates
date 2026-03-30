<template>
  <div class="app-container">
    <ThreeScene
      :modelPath="modelPath"
      @model-loaded="onModelLoaded"
      @part-clicked="onPartClicked"
    />
    <div v-if="loading" class="loading-overlay">
      Loading Mercedes-Benz E-Class...
    </div>
    <div v-if="selectedPart" class="info-overlay">
      <h3>Selected Part</h3>
      <p><strong>ID:</strong> {{ selectedPart.id }}</p>
      <p><strong>Name:</strong> {{ selectedPart.name || 'Unnamed' }}</p>
      <button @click="clearSelection">Close</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ThreeScene from './components/ThreeScene.vue'

const modelPath = '/models/scene.gltf'
const loading = ref(true)
const selectedPart = ref(null)

const onModelLoaded = () => {
  loading.value = false
}

const onPartClicked = (partInfo) => {
  selectedPart.value = partInfo
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

.loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 20px;
  background: rgba(0, 0, 0, 0.7);
  padding: 20px;
  border-radius: 10px;
}

.info-overlay {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 8px;
  max-width: 300px;
  font-family: Arial, sans-serif;
}

.info-overlay h3 {
  margin-top: 0;
  color: #4CAF50;
}

.info-overlay button {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

.info-overlay button:hover {
  background: #45a049;
}
</style>